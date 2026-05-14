#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';

const version = process.argv[2];

if (!version) {
    console.log('Usage: node scripts/set-version.js <version>');
    console.log('Example: node scripts/set-version.js 0.17.0');
    process.exit(1);
}

if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error(`Invalid version: ${version}`);
    process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');

const packageJsonPaths = [
    ...findPackageJsons('packages'),
    ...findPackageJsons('examples'),
    ...findPackageJsons('exploration'),
    path.join(root, 'dev-environment', 'package.json'),
    path.join(root, 'package.json'),
];

let updatedFiles = 0;

for (const filePath of packageJsonPaths) {
    let content;
    try {
        content = readFileSync(filePath, 'utf-8');
    } catch {
        continue;
    }

    const pkg = JSON.parse(content);
    let changed = false;

    const isPlugin = filePath.startsWith(path.join(root, 'packages') + path.sep);
    if (isPlugin && pkg.version && pkg.version !== version) {
        pkg.version = version;
        changed = true;
    }

    for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const deps = pkg[depField];
        if (!deps) continue;
        for (const [name, value] of Object.entries(deps)) {
            if (!name.startsWith('@jay-framework/')) continue;
            if (value.startsWith('workspace:')) continue;
            const target = `^${version}`;
            if (value !== target) {
                deps[name] = target;
                changed = true;
            }
        }
    }

    if (changed) {
        writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
        console.log(`  updated ${path.relative(root, filePath)}`);
        updatedFiles++;
    }
}

console.log(`\nSet version to ${version} across ${updatedFiles} file(s).`);

function findPackageJsons(dir) {
    const results = [];
    const absDir = path.join(root, dir);
    let entries;
    try {
        entries = readdirSync(absDir);
    } catch {
        return results;
    }
    for (const entry of entries) {
        results.push(path.join(absDir, entry, 'package.json'));
    }
    return results;
}

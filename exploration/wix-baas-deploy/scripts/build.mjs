#!/usr/bin/env node

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// 1. Bundle entry.mjs
const result = await esbuild.build({
  entryPoints: ['src/entry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/entry.mjs',
  external: ['node:*'],
  minify: false,
  metafile: true,
});

const stat = fs.statSync('dist/entry.mjs');
console.log(`Built dist/entry.mjs (${(stat.size / 1024).toFixed(1)} KB)`);
console.log(`Bundled ${Object.keys(result.metafile.inputs).length} input files`);

// 2. Write .wix/build-metadata.json (required by `wix release`)
const wixDir = path.join(PROJECT_ROOT, '.wix');
fs.mkdirSync(wixDir, { recursive: true });

const distDir = path.join(PROJECT_ROOT, 'dist');
const buildMetadata = {
  outDir: distDir,
  clientDir: distDir,
  serverDir: distDir,
};

fs.writeFileSync(path.join(wixDir, 'build-metadata.json'), JSON.stringify(buildMetadata, null, 2));
console.log(`Wrote .wix/build-metadata.json`);

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse command-line arguments
const args = process.argv.slice(2);
const SCRIPT_DIR = __dirname;
const sourceRepoArg = args[0] || path.join(__dirname, '..', 'jay');
const SOURCE_REPO = path.resolve(sourceRepoArg);
const TARGET_DIR = path.join(SCRIPT_DIR, 'node_modules');
const PACKAGE_PREFIX = '@jay-framework';

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`${colors.yellow}Jay Framework Package Sync Script${colors.reset}`);
  console.log('');
  console.log('Usage:');
  console.log('  node sync-jay-packages.cjs [source-repo-path]');
  console.log('');
  console.log('Arguments:');
  console.log('  source-repo-path  Path to the jay source repository');
  console.log('                    Default: ../jay (relative to script location)');
  console.log('');
  console.log('Examples:');
  console.log('  node sync-jay-packages.cjs');
  console.log('  node sync-jay-packages.cjs /path/to/jay');
  console.log('  node sync-jay-packages.cjs ../jay');
  process.exit(0);
}

console.log(`${colors.yellow}Jay Framework Package Sync Script${colors.reset}`);
console.log(`Script directory: ${SCRIPT_DIR}`);
console.log(`Source: ${SOURCE_REPO}`);
console.log(`Target: ${TARGET_DIR}`);
console.log('');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'package.json') {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyRootFilesMatching(sourcePath, targetPath, pattern) {
  let copied = 0;

  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    if (!entry.isFile() || !pattern.test(entry.name)) {
      continue;
    }

    fs.copyFileSync(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    copied++;
  }

  return copied;
}

function mapPackageName(packageName) {
  if (packageName === 'jay-stack-cli') return 'stack-cli';
  if (packageName === 'jay-cli') return 'cli';
  if (packageName === 'fullstack-component') return 'full-stack-component';
  if (packageName === 'stack-route-scanner') return 'route-scanner';
  if (packageName === 'gemini-agent-plugin') return 'gemini-agent';
  if (packageName === 'webmcp-plugin') return 'webmcp';
  return packageName;
}

function jaySourcePaths(actualPackageName) {
  return [
    path.join(SOURCE_REPO, 'packages', 'jay-stack', actualPackageName),
    path.join(SOURCE_REPO, 'packages', 'jay-stack-plugins', actualPackageName),
    path.join(SOURCE_REPO, 'packages', 'compiler', actualPackageName),
    path.join(SOURCE_REPO, 'packages', 'runtime', actualPackageName),
    path.join(SOURCE_REPO, 'packages', 'plugins', actualPackageName),
    path.join(SOURCE_REPO, 'packages', actualPackageName),
  ];
}

function resolveSourcePath(packageName) {
  const actualPackageName = mapPackageName(packageName);
  const possiblePaths = [
    path.join(SCRIPT_DIR, 'packages', actualPackageName),
    ...jaySourcePaths(actualPackageName),
  ];

  return possiblePaths.find((sourcePath) => fs.existsSync(sourcePath));
}

function copyPackageArtifacts(sourcePath, targetPath) {
  const sourceDistPath = path.join(sourcePath, 'dist');
  if (!fs.existsSync(sourceDistPath)) {
    throw new Error(`dist folder not found: ${sourceDistPath}`);
  }

  copyDirSync(sourceDistPath, path.join(targetPath, 'dist'));
  console.log(`  ✓ Copied dist`);

  const sourcePluginYaml = path.join(sourcePath, 'plugin.yaml');
  if (fs.existsSync(sourcePluginYaml)) {
    fs.copyFileSync(sourcePluginYaml, path.join(targetPath, 'plugin.yaml'));
    console.log(`  ✓ Copied plugin.yaml`);
  }

  const jayCommandCount = copyRootFilesMatching(sourcePath, targetPath, /\.jay-command$/);
  if (jayCommandCount > 0) {
    console.log(`  ✓ Copied ${jayCommandCount} .jay-command file(s)`);
  }

  for (const dirName of ['agent-kit', 'agent-kit-template']) {
    const sourceDir = path.join(sourcePath, dirName);
    if (fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory()) {
      copyDirSync(sourceDir, path.join(targetPath, dirName));
      console.log(`  ✓ Copied ${dirName}`);
    }
  }
}

function copyPackage(packageName, sourcePath) {
  const targetPath = path.join(TARGET_DIR, PACKAGE_PREFIX, packageName);

  console.log(`Copying ${colors.green}${packageName}${colors.reset}...`);

  if (!fs.existsSync(targetPath)) {
    console.log(
      `${colors.red}  ✗ Not installed in node_modules — run yarn install first${colors.reset}`,
    );
    return false;
  }

  try {
    copyPackageArtifacts(sourcePath, targetPath);
    return true;
  } catch (error) {
    console.log(`${colors.red}  ✗ Error copying ${packageName}: ${error.message}${colors.reset}`);
    return false;
  }
}

function main() {
  if (!fs.existsSync(SOURCE_REPO)) {
    console.log(`${colors.red}Error: Source repository not found at ${SOURCE_REPO}${colors.reset}`);
    process.exit(1);
  }

  const jayFrameworkDir = path.join(TARGET_DIR, PACKAGE_PREFIX);
  if (!fs.existsSync(jayFrameworkDir)) {
    console.log(`${colors.yellow}No @jay-framework directory found in node_modules${colors.reset}`);
    console.log(
      'Run yarn install first to install the packages, then run this script to sync them.',
    );
    process.exit(0);
  }

  const installedPackages = fs
    .readdirSync(jayFrameworkDir, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isDirectory()) return true;
      if (!entry.isSymbolicLink()) return false;
      return fs.statSync(path.join(jayFrameworkDir, entry.name)).isDirectory();
    })
    .map((entry) => entry.name);

  if (installedPackages.length === 0) {
    console.log(`${colors.yellow}No @jay-framework packages found in node_modules${colors.reset}`);
    process.exit(0);
  }

  console.log('Installed packages:');
  installedPackages.forEach((packageName) => {
    console.log(`  - ${packageName}`);
  });
  console.log('');

  let successCount = 0;
  let failCount = 0;

  for (const packageName of installedPackages) {
    const sourcePath = resolveSourcePath(packageName);
    if (!sourcePath) {
      console.log(
        `${colors.red}  ✗ Could not find local source for: ${packageName}${colors.reset}`,
      );
      failCount++;
      continue;
    }

    if (copyPackage(packageName, sourcePath)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('');
  console.log(`${colors.green}Package sync complete!${colors.reset}`);
  console.log(`${colors.green}✓ ${successCount} packages copied successfully${colors.reset}`);
  if (failCount > 0) {
    console.log(`${colors.red}✗ ${failCount} packages failed${colors.reset}`);
  }
  console.log('');
  console.log('Note: If you encounter issues, you may need to:');
  console.log(`1. Build jay packages: cd ${SOURCE_REPO} && yarn build`);
  console.log(`2. Build wix packages: cd ${SCRIPT_DIR} && yarn build`);
}

main();

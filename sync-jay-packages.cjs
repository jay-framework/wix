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
    reset: '\x1b[0m'
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

// Helper function to copy directory recursively (excluding package.json files)
function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) {
        throw new Error(`Source directory does not exist: ${src}`);
    }
    
    // Create destination directory
    fs.mkdirSync(dest, { recursive: true });
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        // Skip package.json files to avoid messing with dependencies
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

// Function to copy a package (content only, preserving existing package.json)
function copyPackage(packageName, sourcePath) {
    const targetPath = path.join(TARGET_DIR, PACKAGE_PREFIX, packageName);
    const sourceDistPath = path.join(sourcePath, 'dist');
    const targetDistPath = path.join(targetPath, 'dist');
    
    if (fs.existsSync(sourcePath)) {
        console.log(`Copying ${colors.green}${packageName}${colors.reset}...`);
        
        if (!fs.existsSync(sourceDistPath)) {
            console.log(`${colors.red}  ✗ dist folder not found: ${sourceDistPath}${colors.reset}`);
            return false;
        }
        
        try {
            // Only copy content from dist folder to dist folder, preserving existing package.json
            copyDirSync(sourceDistPath, targetDistPath);
            console.log(`  ✓ Copied to ${targetDistPath}`);
            return true;
        } catch (error) {
            console.log(`${colors.red}  ✗ Error copying ${packageName}: ${error.message}${colors.reset}`);
            return false;
        }
    } else {
        console.log(`${colors.red}  ✗ Source not found: ${sourcePath}${colors.reset}`);
        return false;
    }
}

// Main function
function main() {
    // Check if source repo exists
    if (!fs.existsSync(SOURCE_REPO)) {
        console.log(`${colors.red}Error: Source repository not found at ${SOURCE_REPO}${colors.reset}`);
        process.exit(1);
    }
    
    // Create node_modules/@jay-framework if it doesn't exist
    const jayFrameworkDir = path.join(TARGET_DIR, PACKAGE_PREFIX);
    if (!fs.existsSync(jayFrameworkDir)) {
        fs.mkdirSync(jayFrameworkDir, { recursive: true });
    }
    
    // Read existing @jay-framework packages from node_modules
    console.log('Reading existing @jay-framework packages from node_modules...');
    
    if (!fs.existsSync(jayFrameworkDir)) {
        console.log(`${colors.yellow}No @jay-framework directory found in node_modules${colors.reset}`);
        console.log('Run npm install first to install the packages, then run this script to sync them.');
        process.exit(0);
    }
    
    const existingPackages = fs.readdirSync(jayFrameworkDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    
    if (existingPackages.length === 0) {
        console.log(`${colors.yellow}No @jay-framework packages found in node_modules${colors.reset}`);
        process.exit(0);
    }
    
    console.log('Found existing packages:');
    existingPackages.forEach(packageName => {
        console.log(`  - ${packageName}`);
    });
    console.log('');
    
    // Copy each existing package
    let successCount = 0;
    let failCount = 0;
    
    for (const packageName of existingPackages) {
        // Handle package name mappings for jay-stack packages
        let actualPackageName = packageName;
        if (packageName === 'jay-stack-cli') {
            actualPackageName = 'stack-cli';
        } else if (packageName === 'jay-cli') {
                actualPackageName = 'cli';
        } else if (packageName === 'fullstack-component') {
            actualPackageName = 'full-stack-component';
        } else if (packageName === 'stack-route-scanner') {
            actualPackageName = 'route-scanner';
        }
        
        // Try different possible source paths
        const possiblePaths = [
            path.join(SOURCE_REPO, 'packages', 'jay-stack', actualPackageName),
            path.join(SOURCE_REPO, 'packages', 'compiler', actualPackageName),
            path.join(SOURCE_REPO, 'packages', 'runtime', actualPackageName),
            path.join(SOURCE_REPO, 'packages', actualPackageName)
        ];
        
        let found = false;
        for (const sourcePath of possiblePaths) {
            if (fs.existsSync(sourcePath)) {
                if (copyPackage(packageName, sourcePath)) {
                    successCount++;
                } else {
                    failCount++;
                }
                found = true;
                break;
            }
        }
        
        if (!found) {
            console.log(`${colors.red}  ✗ Could not find source for: ${packageName}${colors.reset}`);
            console.log('    Tried paths:');
            possiblePaths.forEach(p => console.log(`      ${p}`));
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
    console.log(`1. Build the packages in the source repo first: cd ${SOURCE_REPO} && yarn build`);
    console.log('2. Check that the package names in your package.json match the actual package structure');
}

// Run the script
main();
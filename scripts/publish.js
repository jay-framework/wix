#!/usr/bin/env node

import { execSync } from 'child_process';

// Check if OTP is provided as environment variable
const otp = process.env.NPM_OTP;

if (!otp) {
    console.log('NPM_OTP environment variable not set.');
    console.log('');
    console.log('Usage:');
    console.log('  export NPM_OTP=your_otp_token');
    console.log('  yarn publish');
    console.log('');
    console.log('Or use interactive mode (prompts for OTP per package):');
    console.log('  yarn publish:interactive');
    process.exit(1);
}

console.log('Publishing packages with OTP token...');

try {
    execSync(
        `yarn workspaces foreach -p --no-private exec "yarn npm publish --access public --otp ${otp}"`,
        {
            stdio: 'inherit',
            cwd: process.cwd(),
        },
    );

    console.log('All packages published successfully!');
} catch (error) {
    console.error('Publishing failed:', error.message);
    process.exit(1);
}

#!/usr/bin/env node

/**
 * Setup: Create a BaaS app project for deployment.
 * Uses ambassador packages from the wix-cli directory.
 *
 * Prerequisites:
 * - Run `wix login` first (stores tokens in ~/.wix/auth/)
 * - Set appId and siteId in wix.config.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WIX_CLI_ROOT = path.resolve(PROJECT_ROOT, '../../wix-cli');

// Resolve ambassador packages from wix-cli's node_modules
const wixRequire = createRequire(path.join(WIX_CLI_ROOT, 'package.json'));

const { createHttpClient } = wixRequire('@wix/http-client');
const { createAppProject, getAppProject } = wixRequire('@wix/ambassador-velo-backend-v1-app-project/http');
const { getOrCreateCompanionApp } = wixRequire('@wix/ambassador-devcenter-apps-companionapps-v1-companion-app/http');
const { installApp } = wixRequire('@wix/ambassador-apps-v1-app-instance/http');
const { V1TenantType } = wixRequire('@wix/ambassador-apps-v1-app-instance/types');

function loadAuthToken() {
    const accountPath = path.join(process.env.HOME, '.wix', 'auth', 'account.json');
    if (fs.existsSync(accountPath)) {
        const auth = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
        return auth.accessToken;
    }
    const apiKeyPath = path.join(process.env.HOME, '.wix', 'auth', 'api-key.json');
    if (fs.existsSync(apiKeyPath)) {
        const auth = JSON.parse(fs.readFileSync(apiKeyPath, 'utf8'));
        return auth.apiKey;
    }
    throw new Error('No auth token found. Run `wix login` first.');
}

function loadConfig() {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'wix.config.json'), 'utf8'));
}

async function main() {
    const token = loadAuthToken();
    const config = loadConfig();
    const appId = config.appId;
    const siteId = config.siteId;

    console.log(`App ID: ${appId}`);
    console.log(`Site ID: ${siteId}`);

    const httpClient = createHttpClient({
        getAppToken: async () => token,
        createHeaders: () => ({
            'X-XSRF-TOKEN': 'nocheck',
            'Cookie': 'XSRF-TOKEN=nocheck',
            'User-Agent': 'jay-baas-deploy',
        }),
    });

    // Step 1: Check if app project already exists
    console.log('\n--- Step 1: Check existing app project ---');
    try {
        const { data } = await httpClient.request(getAppProject({ appProjectId: appId }));
        console.log('App project already exists:', JSON.stringify(data.appProject, null, 2));
        console.log('\nSetup already done! Use `npm run deploy` to deploy.');
        return;
    } catch (e) {
        if (e.response?.status === 404) {
            console.log('No existing app project — will create one.');
        } else {
            throw e;
        }
    }

    // Step 2: Create app project with CloudFlare provider
    console.log('\n--- Step 2: Create app project ---');
    const slug = `jay-${crypto.randomBytes(4).toString('hex')}`;

    const { data: projectData } = await httpClient.request(
        createAppProject({
            appProject: {
                id: appId,
                displayName: 'Jay BaaS Exploration',
                slug,
                appProjectTypeId: 'eb363dea-85a0-4159-9b05-949542be5079', // HEADLESS
                cloudProviderOverride: 'CLOUD_FLARE',
            },
        }),
    );

    console.log('Created app project:', JSON.stringify(projectData.appProject, null, 2));

    // Save project info
    const wixDir = path.join(PROJECT_ROOT, '.wix');
    fs.mkdirSync(wixDir, { recursive: true });
    fs.writeFileSync(
        path.join(wixDir, 'project-info.json'),
        JSON.stringify(projectData, null, 2),
    );
    console.log(`\nBase URL: ${projectData.appProject?.baseUrl}`);
}

main().catch(err => {
    console.error('Fatal:', err.message || err);
    if (err.response?.data) console.error('Details:', JSON.stringify(err.response.data, null, 2));
    process.exit(1);
});

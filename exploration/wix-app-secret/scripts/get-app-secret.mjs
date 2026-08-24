#!/usr/bin/env node

/**
 * Exploration: Can we auto-retrieve appSecret during setup?
 *
 * Flow:
 * 1. Get access token via `npx @wix/cli@latest token`
 * 2. Read appId from wix.config.json
 * 3. Call Dev Center API: GET /v1/apps/{appId}?withSecrets=true
 * 4. Extract appSecrets.appSecret from response
 *
 * Prerequisites:
 * - Run `npx @wix/cli@latest login` first
 * - Have a wix.config.json with appId in the project root
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function getAccessToken() {
  console.log('--- Getting access token via wix cli ---');
  try {
    const token = execSync('npx @wix/cli@latest token', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!token) {
      throw new Error('Empty token returned. Are you logged in? Run: npx @wix/cli@latest login');
    }
    console.log(`Token: ${token.substring(0, 20)}...`);
    return token;
  } catch (e) {
    console.error('Failed to get token. Make sure you are logged in.');
    console.error('Run: npx @wix/cli@latest login');
    throw e;
  }
}

function loadConfig() {
  const configPath = path.join(PROJECT_ROOT, 'wix.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`No wix.config.json found at ${configPath}. Run: npx @wix/cli@latest init`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function getAppWithSecrets(token, appId) {
  const url = `https://manage.wix.com/apps-service/v1/apps/${appId}?withSecrets=true`;
  console.log(`\n--- Calling Dev Center API: GET ${url} ---`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: token,
      'X-XSRF-TOKEN': 'nocheck',
      Cookie: 'XSRF-TOKEN=nocheck',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Dev Center API failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function getEnvVariables(token, appId, environment) {
  console.log(`\n--- Calling BaaS Env Variables API for ${environment} ---`);

  const url = `https://www.wixapis.com/v2/app-projects/${appId}/app-environment-variables/environment/${environment}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: token,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`BaaS env API failed (${response.status}): ${body}`);
    return null;
  }

  return response.json();
}

async function main() {
  const token = getAccessToken();
  const config = loadConfig();
  const appId = config.appId;

  if (!appId) {
    throw new Error('wix.config.json has no appId');
  }

  console.log(`\nApp ID: ${appId}`);

  // Approach 1: Dev Center API (getApp with secrets)
  try {
    const appData = await getAppWithSecrets(token, appId);
    console.log('\nDev Center response:');
    console.log(JSON.stringify(appData, null, 2));

    if (appData.app?.appSecrets?.appSecret) {
      console.log(
        `\n✓ appSecret retrieved: ${appData.app.appSecrets.appSecret.substring(0, 20)}...`,
      );
    } else {
      console.log('\n✗ No appSecret in response');
    }
  } catch (e) {
    console.error('\nDev Center approach failed:', e.message);
  }

  // Approach 2: BaaS env variables (for comparison)
  try {
    const envData = await getEnvVariables(token, appId, 'production');
    if (envData) {
      console.log('\nBaaS env variables (production):');
      console.log(JSON.stringify(envData, null, 2));
    }
  } catch (e) {
    console.warn('\nBaaS env approach failed (expected if no BaaS project):', e.message);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err.message || err);
  process.exit(1);
});

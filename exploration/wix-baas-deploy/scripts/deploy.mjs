#!/usr/bin/env node

/**
 * Deploy: Upload dist/ files to BaaS.
 * Uses ambassador packages from the wix-cli directory.
 *
 * Flow:
 * 1. Collect files from dist/
 * 2. createAppDeployment() — sends metadata, gets upload URLs + auth
 * 3. Upload files — CloudFlare FormData or Kubernetes PUT
 * 4. completeAppDeployment() — finalize with backend files
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const WIX_CLI_ROOT = path.resolve(PROJECT_ROOT, '../../wix-cli');

// Resolve ambassador packages from wix-cli's node_modules
const wixRequire = createRequire(path.join(WIX_CLI_ROOT, 'package.json'));

const { createHttpClient } = wixRequire('@wix/http-client');
const { createAppDeployment, completeAppDeployment } = wixRequire(
  '@wix/ambassador-velo-backend-v1-app-deployment/http',
);

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

function md5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.mjs': 'application/javascript',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
  };
  return types[ext] || 'application/octet-stream';
}

function collectFiles(dir, base = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, relativePath));
    } else {
      const content = fs.readFileSync(fullPath);
      files.push({
        path: `/${relativePath}`,
        content,
        hash: md5(content),
        contentType: getMimeType(entry.name),
        size: content.length,
      });
    }
  }
  return files;
}

async function main() {
  const token = loadAuthToken();
  const config = loadConfig();
  const appId = config.appId;

  const httpClient = createHttpClient({
    getAppToken: async () => token,
    createHeaders: () => ({
      'X-XSRF-TOKEN': 'nocheck',
      Cookie: 'XSRF-TOKEN=nocheck',
      'User-Agent': 'jay-baas-deploy',
    }),
  });

  // Collect files
  console.log('Collecting files from dist/...');
  const files = collectFiles(DIST_DIR);
  console.log(`Found ${files.length} files:`);
  for (const f of files) {
    console.log(`  ${f.path} (${(f.size / 1024).toFixed(1)} KB, ${f.contentType})`);
  }

  const staticFilesMetadata = files.map((f) => ({
    path: f.path,
    hash: f.hash,
    contentType: f.contentType,
    size: f.size,
  }));

  // Step 1: Create deployment
  console.log('\n--- Step 1: Create deployment ---');
  const { data: deployData } = await httpClient.request(
    createAppDeployment({
      appDeployment: {
        appProjectId: appId,
        staticFilesMetadata,
      },
    }),
  );

  const appDeployment = deployData.appDeployment;
  const uploadUrls = deployData.staticFilesUploadUrls || [];
  const uploadToken = deployData.uploadAuthToken;
  const uploadBuckets = deployData.uploadBuckets || [];

  console.log('  Deployment ID:', appDeployment?.id);
  console.log('  Cloud provider:', appDeployment?.cloudProviderOverride);
  console.log('  Upload URLs:', uploadUrls.length);
  console.log('  Upload buckets:', uploadBuckets.length);
  console.log('  Auth token:', uploadToken ? 'present' : 'missing');

  // Step 2: Upload static files
  if (uploadUrls.length > 0) {
    const isKubernetes = appDeployment?.cloudProviderOverride === 'KUBERNETES';

    if (isKubernetes) {
      console.log('\n--- Step 2: Upload files (Kubernetes PUT) ---');
      for (const uploadInfo of uploadUrls) {
        const file = files.find((f) => f.path === uploadInfo.staticFileMetadata.path);
        if (!file) continue;

        console.log(`  Uploading ${file.path}...`);
        const response = await fetch(uploadInfo.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.contentType },
          body: file.content,
        });
        if (!response.ok) {
          console.error(`  FAILED: ${response.status} ${await response.text()}`);
        } else {
          console.log(`  OK`);
        }
      }
    } else {
      console.log('\n--- Step 2: Upload files (CloudFlare FormData) ---');
      const uploadUrl = uploadUrls[0].uploadUrl;
      const buckets =
        uploadBuckets.length > 0 ? uploadBuckets : [{ hashes: files.map((f) => f.hash) }];

      for (let i = 0; i < buckets.length; i++) {
        const bucket = buckets[i];
        const formData = new FormData();

        for (const hash of bucket.hashes || []) {
          const file = files.find((f) => f.hash === hash);
          if (!file) continue;
          const blob = new Blob([file.content], { type: file.contentType });
          formData.append(hash, blob, hash);
        }

        console.log(
          `  Uploading bucket ${i + 1}/${buckets.length} (${bucket.hashes?.length} files)...`,
        );
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${uploadToken}` },
          body: formData,
        });

        if (!response.ok) {
          const text = await response.text();
          console.error(`  FAILED: ${response.status}: ${text.substring(0, 300)}`);
        } else {
          const result = await response.json();
          console.log(`  OK:`, JSON.stringify(result));
        }
      }
    }
  }

  // Step 3: Complete deployment with backend files
  console.log('\n--- Step 3: Complete deployment ---');
  const backendFiles = files.map((f) => ({
    path: f.path,
    content: f.content.toString('base64'),
  }));

  const { data: completeData } = await httpClient.request(
    completeAppDeployment({
      appDeployment,
      staticsCompletionToken: uploadToken,
      files: backendFiles,
    }),
  );

  console.log('Deployment complete!');
  console.log('  Status:', completeData.appDeployment?.status);
  console.log('  ID:', completeData.appDeployment?.id);

  // Show base URL
  const projectInfoPath = path.join(PROJECT_ROOT, '.wix', 'project-info.json');
  if (fs.existsSync(projectInfoPath)) {
    const projectInfo = JSON.parse(fs.readFileSync(projectInfoPath, 'utf8'));
    console.log(`\nBase URL: ${projectInfo.appProject?.baseUrl}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  if (err.response?.data) console.error('Details:', JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});

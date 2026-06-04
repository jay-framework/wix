/**
 * jay-stack run wix-deploy/deploy-baas
 *
 * Deploys the dist/ folder to Wix BaaS using ambassador SDK packages.
 * Uploads ALL files including node_modules/.
 *
 * Reads appId from wix.config.json and auth from ~/.wix/auth/.
 */

import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import type { ConsoleContext } from '@jay-framework/fullstack-component';
import { createHttpClient } from '@wix/http-client';
import {
    createAppDeployment,
    completeAppDeployment,
} from '@wix/ambassador-velo-backend-v1-app-deployment/http';
import { createComponentsOverride } from '@wix/ambassador-devcenter-components-overrides-v1-components-override/http';
import { getLatestProductionVersion } from '@wix/ambassador-devcenter-apps-v1-app-version/http';
import { release } from '@wix/ambassador-ctp-gradual-rollout-v1-baas-release/http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface DeployBaasInput {
    dryRun?: boolean;
}

const BACKEND_WORKER_COMPONENT_ID = 'ed5f3d0e-7b79-4717-9c00-c4cd7bbbe906';

function md5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const types: Record<string, string> = {
        '.mjs': 'application/javascript',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.html': 'text/html',
        '.css': 'text/css',
        '.yaml': 'text/yaml',
        '.yml': 'text/yaml',
    };
    return types[ext] || 'application/octet-stream';
}

interface FileEntry {
    path: string;
    content: Buffer;
    hash: string;
    contentType: string;
    size: number;
}

function collectFiles(dir: string, base = ''): FileEntry[] {
    const files: FileEntry[] = [];
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

export const deployBaas = makeCliCommand('deploy-baas')
    .withServices(CONSOLE_CONTEXT)
    .withHandler(async (input: DeployBaasInput, ctx: ConsoleContext) => {
        const distDir = path.resolve(ctx.projectRoot, 'dist');
        const dryRun = input.dryRun || false;

        if (!fs.existsSync(distDir)) {
            ctx.error('dist/ not found. Run wix-deploy/build-entry first.');
            return { success: false };
        }

        // Read appId + siteId from wix.config.json
        const wixConfigPath = path.join(ctx.projectRoot, 'wix.config.json');
        if (!fs.existsSync(wixConfigPath)) {
            ctx.error('wix.config.json not found.');
            return { success: false };
        }
        const wixConfig = JSON.parse(fs.readFileSync(wixConfigPath, 'utf8'));
        const appId = wixConfig.appId;
        const siteId = wixConfig.siteId;

        // Load auth — prefer OAuth token from ~/.wix/auth/, refresh if expired
        const os = await import('node:os');
        const accountPath = path.join(os.homedir(), '.wix', 'auth', 'account.json');
        if (!fs.existsSync(accountPath)) {
            ctx.error('No auth found. Run `wix login` first.');
            return { success: false };
        }
        const authData = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
        let accessToken = authData.accessToken;

        // Check if token is expired and refresh
        const issuedAt = authData.issuedAt * 1000; // epoch seconds → ms
        const expiresAt = issuedAt + authData.expiresIn * 1000;
        if (Date.now() > expiresAt - 60_000) {
            // 1 min buffer
            ctx.log('Access token expired, refreshing...');
            const refreshResponse = await fetch('https://manage.wix.com/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': 'nocheck',
                    Cookie: 'XSRF-TOKEN=nocheck',
                },
                body: JSON.stringify({
                    clientId: '6f95cec8-3e98-48b9-b4e5-1fb92fcd9973',
                    grantType: 'refresh_token',
                    refreshToken: authData.refreshToken,
                }),
            });
            if (!refreshResponse.ok) {
                ctx.error(
                    `Token refresh failed: ${refreshResponse.status}. Run \`wix login\` again.`,
                );
                return { success: false };
            }
            const tokenData = (await refreshResponse.json()) as any;
            accessToken = tokenData.access_token;
            // Update stored token
            authData.accessToken = accessToken;
            authData.issuedAt = Math.floor(Date.now() / 1000);
            authData.expiresIn = tokenData.expires_in;
            fs.writeFileSync(accountPath, JSON.stringify(authData, null, 2));
            ctx.log('Token refreshed');
        }

        const httpClient = createHttpClient({
            baseURL: 'https://manage.wix.com',
            getAppToken: async () => accessToken,
            createHeaders: () => ({
                'X-XSRF-TOKEN': 'nocheck',
                Cookie: 'XSRF-TOKEN=nocheck',
            }),
        });

        const frontendDir = path.resolve(
            ctx.projectRoot,
            wixConfig.site?.outputDirectory?.client || 'build/v1/frontend',
        );
        const serverDir = distDir;

        const clientFiles = fs.existsSync(frontendDir) ? collectFiles(frontendDir) : [];
        const serverFiles = collectFiles(serverDir);
        const files = [...clientFiles, ...serverFiles];
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        ctx.log(
            `${clientFiles.length} client + ${serverFiles.length} server files (${(totalSize / 1024 / 1024).toFixed(1)} MB)`,
        );

        if (dryRun) {
            for (const f of files) {
                ctx.log(`  ${f.path} (${(f.size / 1024).toFixed(1)} KB)`);
            }
            return { success: true, fileCount: files.length, totalSize };
        }

        ctx.log('Creating deployment...');
        const staticFilesMetadata = clientFiles.map((f) => ({
            path: f.path,
            hash: f.hash,
            contentType: f.contentType,
            size: f.size,
        }));

        const { data: deployData } = await httpClient.request(
            createAppDeployment({
                appDeployment: { appProjectId: appId, staticFilesMetadata },
            }),
        );

        const appDeployment = deployData.appDeployment;
        const uploadUrls = deployData.staticFilesUploadUrls || [];
        const uploadToken = deployData.uploadAuthToken;
        const uploadBuckets = deployData.uploadBuckets || [];

        if (uploadUrls.length > 0) {
            const isKubernetes = appDeployment?.cloudProviderOverride === 'KUBERNETES';

            if (isKubernetes) {
                let uploaded = 0;
                for (const uploadInfo of uploadUrls) {
                    const file = clientFiles.find(
                        (f) => f.path === uploadInfo.staticFileMetadata?.path,
                    );
                    if (!file || !uploadInfo.uploadUrl) continue;
                    const response = await fetch(uploadInfo.uploadUrl!, {
                        method: 'PUT',
                        headers: { 'Content-Type': file.contentType },
                        body: file.content,
                    });
                    if (!response.ok) {
                        ctx.error(`  FAILED ${file.path}: ${response.status}`);
                    } else {
                        uploaded++;
                    }
                }
                ctx.log(`Uploaded ${uploaded} CDN files`);
            } else {
                const uploadUrl = uploadUrls[0].uploadUrl!;
                const buckets =
                    uploadBuckets.length > 0
                        ? uploadBuckets
                        : [{ hashes: clientFiles.map((f) => f.hash) }];

                for (let i = 0; i < buckets.length; i++) {
                    const bucket = buckets[i];
                    const formData = new FormData();
                    for (const hash of bucket.hashes || []) {
                        const file = clientFiles.find((f) => f.hash === hash);
                        if (!file) continue;
                        formData.append(
                            hash,
                            new Blob([file.content], { type: file.contentType }),
                            hash,
                        );
                    }
                    const response = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${uploadToken}` },
                        body: formData,
                    });
                    if (!response.ok) {
                        ctx.error(`  Bucket ${i + 1} FAILED: ${response.status}`);
                    } else {
                        ctx.log(
                            `  Bucket ${i + 1}/${buckets.length}: ${bucket.hashes?.length} files`,
                        );
                    }
                }
            }
        }

        ctx.log('Uploading server files...');
        const backendFiles = serverFiles.map((f) => ({
            path: f.path.startsWith('/') ? f.path.slice(1) : f.path,
            content: f.content.toString('base64'),
        }));

        const { data: completeData } = await httpClient.request(
            completeAppDeployment({
                appDeployment: { ...appDeployment, files: backendFiles },
                staticsCompletionToken: uploadToken,
            } as any),
        );

        const completedDeployment = completeData.appDeployment || {};
        const deploymentId = appDeployment?.id;
        const deploymentBaseUrl =
            completedDeployment.deploymentBaseUrl || appDeployment?.deploymentBaseUrl || '';

        let appVersion = 0;
        try {
            const { data: versionData } = await httpClient.request(
                getLatestProductionVersion({ appId }),
            );
            appVersion = (versionData as any).appVersion?.version || 0;
        } catch {
            /* first deployment */
        }

        ctx.log('Registering + releasing...');
        const overrideId = crypto.randomUUID();

        await httpClient.request(
            createComponentsOverride({
                componentsOverride: {
                    appId,
                    appVersion,
                    externalId: appId,
                    id: overrideId,
                    modifiedComponents: [
                        {
                            componentId: BACKEND_WORKER_COMPONENT_ID,
                            type: 'BACKEND_WORKER',
                            data: {
                                backendWorker: {
                                    deploymentId,
                                    deploymentUrl: deploymentBaseUrl,
                                },
                            },
                        },
                    ] as any,
                },
            }),
        );

        const { data: releaseData } = await httpClient.request(
            release({
                appId,
                componentOverrideId: overrideId,
                createMinorVersion: true,
            } as any),
        );

        const releaseUrl = (releaseData as any).releaseBaseUrl || deploymentBaseUrl;
        ctx.log(`Released → ${releaseUrl}`);

        return { success: true, deploymentId, baseUrl: releaseUrl };
    });

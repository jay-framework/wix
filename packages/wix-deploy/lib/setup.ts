/**
 * wix-deploy setup hook
 *
 * Runs after wix-server-client setup, which owns config/.wix.yaml (API key or app strategy, DL #47).
 * Reads wix.config.json for the deploy target, then validates the data collection exists.
 */

import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore — no type declarations
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE, type WixClientService } from '@jay-framework/wix-server-client';
import { items, collections } from '@wix/data';
import { DEFAULT_COLLECTION_ID } from './constants.js';

interface SetupContext {
    configDir: string;
    projectRoot: string;
    initError?: Error;
}

interface SetupResult {
    status: 'configured' | 'needs-config' | 'error';
    message?: string;
    configCreated?: string[];
}

export async function setupWixDeploy(ctx: SetupContext): Promise<SetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed: ${ctx.initError.message}`,
        };
    }

    const wixConfigPath = path.join(ctx.projectRoot, 'wix.config.json');

    if (!fs.existsSync(wixConfigPath)) {
        return {
            status: 'needs-config',
            message: 'wix.config.json not found. Run: npm create @wix/new@latest init',
        };
    }

    const wixConfig = JSON.parse(fs.readFileSync(wixConfigPath, 'utf8'));
    const appId = wixConfig.appId;

    if (!appId) {
        return {
            status: 'error',
            message: 'wix.config.json missing appId',
        };
    }

    const configCreated: string[] = [];

    // Validate data collection exists, create if missing
    let collectionOk = false;
    let wixClient: WixClientService;
    try {
        wixClient = getService(WIX_CLIENT_SERVICE);
    } catch {
        return {
            status: 'needs-config',
            message: 'Wix client not available. Run setup for wix-server-client first.',
        };
    }
    if (wixClient) {
        const dataClient = wixClient.use({ items, collections });
        try {
            await dataClient.items.query(DEFAULT_COLLECTION_ID).limit(1).find();
            collectionOk = true;
        } catch {
            try {
                await dataClient.collections.createDataCollection({
                    _id: DEFAULT_COLLECTION_ID,
                    displayName: 'Jay Backend Files',
                    fields: [
                        { key: 'path', type: 'TEXT' },
                        { key: 'content', type: 'TEXT' },
                        { key: 'fileType', type: 'TEXT' },
                        { key: 'sizeBytes', type: 'NUMBER' },
                        { key: 'category', type: 'TEXT' },
                        { key: 'version', type: 'TEXT' },
                        // instance items (cache.json): their own index entry (Jay DL#227)
                        { key: 'route', type: 'TEXT' },
                        { key: 'params', type: 'OBJECT' },
                    ],
                    permissions: {
                        insert: 'ADMIN',
                        update: 'ADMIN',
                        remove: 'ADMIN',
                        read: 'ADMIN',
                    },
                });
                collectionOk = true;
                configCreated.push('collection');
            } catch (createErr) {
                return {
                    status: 'error',
                    configCreated,
                    message: `Failed to create data collection "${DEFAULT_COLLECTION_ID}": ${createErr instanceof Error ? createErr.message : createErr}`,
                };
            }
        }
    }

    return {
        status: 'configured',
        configCreated,
        message: `Deploy target: wix.config.json (appId: ${appId.slice(0, 8)}...). Collection: ${DEFAULT_COLLECTION_ID} ${collectionOk ? '✓' : ''}`,
    };
}

/**
 * jay-stack run wix-deploy/upload-backend
 *
 * Uploads backend build files to a Wix data collection for BaaS serving.
 * Skips images and .jay-html files (not used at serve time).
 * Categorizes files as eager (loaded on cold start) or lazy (per-page).
 *
 * Uses WIX_CLIENT_SERVICE for authentication (API key from wix-server-client plugin).
 */

import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import type { ConsoleContext } from '@jay-framework/fullstack-component';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import type { WixClientService } from '@jay-framework/wix-server-client';
import { items } from '@wix/data';

interface UploadBackendInput {
    collectionId?: string;
    dryRun?: boolean;
}

const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.jay-html']);
const BATCH_SIZE = 50;

function categorize(relativePath: string): 'eager' | 'lazy' {
    if (relativePath === 'route-manifest.json') return 'eager';
    if (relativePath === 'build-metadata.json') return 'eager';
    if (relativePath.startsWith('server/')) return 'eager';
    return 'lazy';
}

interface BackendFile {
    relativePath: string;
    content: string;
    sizeBytes: number;
    fileType: string;
    category: 'eager' | 'lazy';
}

function scanBackendFiles(dir: string, base: string, fs: typeof import('node:fs'), path: typeof import('node:path')): BackendFile[] {
    const files: BackendFile[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...scanBackendFiles(fullPath, relativePath, fs, path));
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (SKIP_EXTENSIONS.has(ext)) continue;
            const content = fs.readFileSync(fullPath, 'utf8');
            files.push({
                relativePath,
                content,
                sizeBytes: Buffer.byteLength(content),
                fileType: ext.slice(1),
                category: categorize(relativePath),
            });
        }
    }
    return files;
}

export const uploadBackend = makeCliCommand('upload-backend')
    .withServices(WIX_CLIENT_SERVICE, CONSOLE_CONTEXT)
    .withHandler(async (input: UploadBackendInput, wixClient: WixClientService, ctx: ConsoleContext) => {
        const fs = await import('node:fs');
        const path = await import('node:path');

        const buildDir = ctx.build.backend;
        const collectionId = input.collectionId || 'jay-backend-files';
        const dryRun = input.dryRun || false;

        ctx.log(`Backend dir: ${buildDir}`);
        ctx.log(`Collection: ${collectionId}`);
        if (dryRun) ctx.log('DRY RUN — no uploads');

        if (!fs.existsSync(buildDir)) {
            ctx.error(`Backend dir not found: ${buildDir}`);
            return { success: false };
        }

        const files = scanBackendFiles(buildDir, '', fs, path);
        const eager = files.filter(f => f.category === 'eager');
        const lazy = files.filter(f => f.category === 'lazy');
        const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);

        ctx.log(`Found ${files.length} files (${eager.length} eager, ${lazy.length} lazy)`);
        ctx.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

        if (dryRun) {
            for (const f of files.slice(0, 20)) {
                ctx.log(`  [${f.category}] ${f.relativePath} (${(f.sizeBytes / 1024).toFixed(0)} KB)`);
            }
            if (files.length > 20) ctx.log(`  ... and ${files.length - 20} more`);
            return { success: true, fileCount: files.length, totalSize };
        }

        // Use the Wix client from wix-server-client (already authenticated with API key)
        const dataClient = wixClient.wixClient.use({ items });

        let uploaded = 0;
        let errors = 0;

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            const dataItems = batch.map(f => ({
                _id: f.relativePath.replace(/[/\\]/g, '__'),
                path: f.relativePath,
                content: f.content,
                fileType: f.fileType,
                sizeBytes: f.sizeBytes,
                category: f.category,
            }));

            try {
                await dataClient.items.bulkSave(collectionId, dataItems);
                uploaded += batch.length;
                ctx.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} files (${uploaded}/${files.length})`);
            } catch (err: any) {
                ctx.warn(`  Batch failed: ${err.message?.substring(0, 200)}`);
                for (const item of dataItems) {
                    try {
                        await dataClient.items.save(collectionId, item);
                        uploaded++;
                    } catch (e: any) {
                        errors++;
                        ctx.error(`  FAILED: ${item.path} (${item.sizeBytes} bytes): ${e.message?.substring(0, 100)}`);
                    }
                }
            }
        }

        ctx.log(`Done: ${uploaded} uploaded, ${errors} errors`);
        return { success: errors === 0, uploaded, errors };
    });

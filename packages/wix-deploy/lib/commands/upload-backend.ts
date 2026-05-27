/**
 * jay-stack run wix-deploy/upload-backend
 *
 * Uploads backend build files to a Wix data collection for BaaS serving.
 * Skips images and .jay-html files (not used at serve time).
 * Categorizes files as eager (loaded on cold start) or lazy (per-page).
 *
 * Uses WIX_CLIENT_SERVICE for authentication (API key from wix-server-client plugin).
 * Loads file content only at upload time to avoid memory issues with large builds.
 */

import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import type { ConsoleContext } from '@jay-framework/fullstack-component';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import type { WixClientService } from '@jay-framework/wix-server-client';
import { items } from '@wix/data';
import { DEFAULT_COLLECTION_ID } from '../constants.js';

interface UploadBackendInput {
    collectionId?: string;
    dryRun?: boolean;
}

const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.jay-html']);
const MAX_BATCH_BYTES = 400_000; // Stay under Wix data 512 KB per-row limit with margin

function categorize(relativePath: string): 'eager' | 'lazy' {
    if (relativePath === 'route-manifest.json') return 'eager';
    if (relativePath === 'build-metadata.json') return 'eager';
    if (relativePath.startsWith('server/')) return 'eager';
    return 'lazy';
}

interface FileEntry {
    relativePath: string;
    fullPath: string;
    sizeBytes: number;
    fileType: string;
    category: 'eager' | 'lazy';
}

function scanFileEntries(dir: string, base: string, fs: typeof import('node:fs'), path: typeof import('node:path')): FileEntry[] {
    const entries: FileEntry[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            entries.push(...scanFileEntries(fullPath, relativePath, fs, path));
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (SKIP_EXTENSIONS.has(ext)) continue;
            const stat = fs.statSync(fullPath);
            entries.push({
                relativePath,
                fullPath,
                sizeBytes: stat.size,
                fileType: ext.slice(1),
                category: categorize(relativePath),
            });
        }
    }
    return entries;
}

function buildBatches(entries: FileEntry[]): FileEntry[][] {
    const batches: FileEntry[][] = [];
    let currentBatch: FileEntry[] = [];
    let currentSize = 0;

    for (const entry of entries) {
        if (currentBatch.length > 0 && currentSize + entry.sizeBytes > MAX_BATCH_BYTES) {
            batches.push(currentBatch);
            currentBatch = [];
            currentSize = 0;
        }
        currentBatch.push(entry);
        currentSize += entry.sizeBytes;
    }

    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
}

export const uploadBackend = makeCliCommand('upload-backend')
    .withServices(WIX_CLIENT_SERVICE, CONSOLE_CONTEXT)
    .withHandler(async (input: UploadBackendInput, wixClient: WixClientService, ctx: ConsoleContext) => {
        const fs = await import('node:fs');
        const path = await import('node:path');

        const buildDir = ctx.build.backend;
        const collectionId = input.collectionId || DEFAULT_COLLECTION_ID;
        const dryRun = input.dryRun || false;

        ctx.log(`Backend dir: ${buildDir}`);
        ctx.log(`Collection: ${collectionId}`);
        if (dryRun) ctx.log('DRY RUN — no uploads');

        if (!fs.existsSync(buildDir)) {
            ctx.error(`Backend dir not found: ${buildDir}`);
            return { success: false };
        }

        // Scan files — metadata only, no content loaded yet
        const entries = scanFileEntries(buildDir, '', fs, path);
        const eager = entries.filter(f => f.category === 'eager');
        const lazy = entries.filter(f => f.category === 'lazy');
        const totalSize = entries.reduce((sum, f) => sum + f.sizeBytes, 0);

        ctx.log(`Found ${entries.length} files (${eager.length} eager, ${lazy.length} lazy)`);
        ctx.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

        if (dryRun) {
            for (const f of entries.slice(0, 20)) {
                ctx.log(`  [${f.category}] ${f.relativePath} (${(f.sizeBytes / 1024).toFixed(0)} KB)`);
            }
            if (entries.length > 20) ctx.log(`  ... and ${entries.length - 20} more`);
            return { success: true, fileCount: entries.length, totalSize };
        }

        const dataClient = wixClient.wixClient.use({ items });
        const batches = buildBatches(entries);

        ctx.log(`Uploading in ${batches.length} batches (max ${(MAX_BATCH_BYTES / 1024).toFixed(0)} KB per batch)`);

        let uploaded = 0;
        let errors = 0;

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            // Load content only for this batch
            const dataItems = batch.map(f => ({
                _id: f.relativePath.replace(/[/\\]/g, '__'),
                path: f.relativePath,
                content: fs.readFileSync(f.fullPath, 'utf8'),
                fileType: f.fileType,
                sizeBytes: f.sizeBytes,
                category: f.category,
            }));

            try {
                await dataClient.items.bulkSave(collectionId, dataItems);
                uploaded += batch.length;
                ctx.log(`  Batch ${i + 1}/${batches.length}: ${batch.length} files (${uploaded}/${entries.length})`);
            } catch (err: any) {
                ctx.warn(`  Batch ${i + 1} failed, retrying individually: ${err.message?.substring(0, 200)}`);
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

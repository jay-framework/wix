/**
 * Upload golf project backend build files to a Wix data collection.
 *
 * Tests:
 * 1. Can we store ~1000+ items in a single collection?
 * 2. What's the max field size for file content?
 * 3. How fast is bulkInsert?
 *
 * Each item stores:
 * - _id: relative file path (used as key for lazy fetching)
 * - path: relative file path
 * - content: file content as text
 * - fileType: extension (js, json)
 * - sizeBytes: original file size
 * - category: 'eager' (shared/manifest) or 'lazy' (per-page)
 */

import { createWixDataClient, COLLECTION_ID } from './wix-client.js';
import fs from 'node:fs';
import path from 'node:path';

const GOLF_BACKEND = '/Users/yoav/work/jay/golf/build/v1/backend';
const BATCH_SIZE = 50;

// Skip binary files and jay-html (not used during serving)
const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.jay-html']);

interface BackendFile {
    relativePath: string;
    content: string;
    sizeBytes: number;
    fileType: string;
    category: 'eager' | 'lazy';
}

function categorize(relativePath: string): 'eager' | 'lazy' {
    // Eager: manifests, shared server code, components, actions
    if (relativePath === 'route-manifest.json') return 'eager';
    if (relativePath === 'build-metadata.json') return 'eager';
    if (relativePath.startsWith('server/')) return 'eager';
    // Lazy: pre-rendered page files
    return 'lazy';
}

function scanBackendFiles(dir: string, base: string = ''): BackendFile[] {
    const files: BackendFile[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = base ? `${base}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            files.push(...scanBackendFiles(fullPath, relativePath));
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

async function main() {
    console.log(`Scanning ${GOLF_BACKEND}...`);
    const files = scanBackendFiles(GOLF_BACKEND);

    const eager = files.filter(f => f.category === 'eager');
    const lazy = files.filter(f => f.category === 'lazy');
    const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);
    const maxFileSize = Math.max(...files.map(f => f.sizeBytes));

    console.log(`Found ${files.length} files (${eager.length} eager, ${lazy.length} lazy)`);
    console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Largest file: ${(maxFileSize / 1024).toFixed(0)} KB`);
    console.log(`File types: ${[...new Set(files.map(f => f.fileType))].join(', ')}`);

    const client = createWixDataClient();
    console.log(`\nUploading to collection "${COLLECTION_ID}"...`);
    console.log('(Collection must exist — create it in Wix dashboard first)\n');

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
            const result = await client.items.bulkInsert(COLLECTION_ID, dataItems);
            uploaded += batch.length;
            console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: uploaded ${batch.length} files (${uploaded}/${files.length})`);
        } catch (err: any) {
            errors += batch.length;
            console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} FAILED:`, err.message?.substring(0, 200));

            // Try individual inserts to find the problematic item
            if (batch.length > 1) {
                console.log('  Retrying individually...');
                for (const item of dataItems) {
                    try {
                        await client.items.save(COLLECTION_ID, item);
                        uploaded++;
                        errors--;
                    } catch (e: any) {
                        console.error(`    FAILED: ${item.path} (${item.sizeBytes} bytes): ${e.message?.substring(0, 100)}`);
                    }
                }
            }
        }
    }

    console.log(`\nDone: ${uploaded} uploaded, ${errors} errors`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});

import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixMediaService } from '../services/wix-media-service.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface UploadEntry {
    mediaId?: string;
    status: 'ready' | 'pending' | 'uploaded';
}

type UploadIndex = Record<string, UploadEntry>;

const UPLOAD_INDEX_FILE = '.wix-media-uploads.json';

const MEDIA_EXTENSIONS = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
    '.bmp',
    '.ico',
    '.mp4',
    '.webm',
    '.mov',
    '.avi',
    '.mp3',
    '.wav',
    '.ogg',
    '.aac',
    '.pdf',
    '.doc',
    '.docx',
]);

function getMimeType(ext: string): string {
    const map: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.aac': 'audio/aac',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return map[ext.toLowerCase()] ?? 'application/octet-stream';
}

function loadUploadIndex(configDir: string): UploadIndex {
    const indexPath = path.join(configDir, UPLOAD_INDEX_FILE);
    if (fs.existsSync(indexPath)) {
        return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
    return {};
}

function saveUploadIndex(configDir: string, index: UploadIndex): void {
    fs.mkdirSync(configDir, { recursive: true });
    const indexPath = path.join(configDir, UPLOAD_INDEX_FILE);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

function scanMediaFiles(dir: string, baseDir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...scanMediaFiles(fullPath, baseDir));
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (MEDIA_EXTENSIONS.has(ext)) {
                results.push(path.relative(baseDir, fullPath));
            }
        }
    }
    return results;
}

export const uploadPublic = makeCliCommand('upload-public')
    .withServices(CONSOLE_CONTEXT)
    .withHandler(async (input: { folder?: string; dryRun?: boolean }, console) => {
        const wixClient = getService(WIX_CLIENT_SERVICE);
        const mediaService = provideWixMediaService(wixClient);

        const publicDir = console.publicFolder;
        const scanDir = input.folder ? path.join(publicDir, input.folder) : publicDir;
        const configDir = path.join(console.projectRoot, 'config');

        console.log(`Scanning ${scanDir} for media files...`);
        const mediaFiles = scanMediaFiles(scanDir, publicDir);

        if (mediaFiles.length === 0) {
            console.log('No media files found.');
            return { success: true };
        }

        console.log(`Found ${mediaFiles.length} media files.`);

        const uploadIndex = loadUploadIndex(configDir);
        const toUpload = mediaFiles.filter((f) => {
            const key = `public/${f}`;
            return !uploadIndex[key] || uploadIndex[key].status !== 'uploaded';
        });

        if (toUpload.length === 0) {
            console.log('All files already uploaded.');
            return { success: true };
        }

        console.log(
            `${toUpload.length} files to upload (${mediaFiles.length - toUpload.length} already uploaded).`,
        );

        if (input.dryRun) {
            for (const file of toUpload) {
                console.log(`[dry-run] Would upload: ${file}`);
            }
            return { success: true };
        }

        let uploaded = 0;
        let failed = 0;

        for (const file of toUpload) {
            const key = `public/${file}`;
            const filePath = path.join(publicDir, file);
            const ext = path.extname(file);
            const mimeType = getMimeType(ext);
            const fileName = path.basename(file);

            try {
                const { uploadUrl } = await mediaService.generateUploadUrl(mimeType, fileName);
                const fileBuffer = fs.readFileSync(filePath);
                const response = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': mimeType },
                    body: fileBuffer,
                });

                if (!response.ok) {
                    throw new Error(`Upload failed with status ${response.status}`);
                }

                uploadIndex[key] = { status: 'uploaded' };
                uploaded++;
                console.log(`Uploaded: ${file}`);
            } catch (err: any) {
                failed++;
                console.error(`Failed to upload ${file}: ${err.message}`);
            }
        }

        saveUploadIndex(configDir, uploadIndex);
        console.log(`Upload complete: ${uploaded} uploaded, ${failed} failed.`);

        return { success: failed === 0 };
    });

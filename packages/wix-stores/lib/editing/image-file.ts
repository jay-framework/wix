/**
 * Reads a local image for `updateProductImage({ imageFile })` (DL #40): resolves it against the
 * project root (the cwd of `jay-stack-cli action`) and checks it before anything is uploaded.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ActionError } from '@jay-framework/fullstack-component';
import type { ImageUpload } from '../wix-apis/upload-media-file.js';

/** Wix's simple upload URL is for files up to 10 MB; larger ones need the resumable API. */
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};

export async function readImageFile(imageFile: string): Promise<ImageUpload> {
    const filePath = path.resolve(process.cwd(), imageFile);
    const sizeInBytes = await sizeOfExistingFile(filePath);
    const mimeType = imageMimeTypeOf(filePath);
    if (sizeInBytes > MAX_IMAGE_FILE_BYTES) {
        throw new ActionError(
            'FILE_TOO_LARGE',
            `"${imageFile}" is ${(sizeInBytes / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB. Ask the user for a smaller image.`,
        );
    }
    return {
        fileName: path.basename(filePath),
        mimeType,
        bytes: new Uint8Array(await readFile(filePath)),
    };
}

async function sizeOfExistingFile(filePath: string): Promise<number> {
    try {
        const stats = await stat(filePath);
        if (stats.isFile()) return stats.size;
    } catch {
        // reported below
    }
    throw new ActionError(
        'FILE_NOT_FOUND',
        `No file at "${filePath}". Pass the attachment path exactly as listed in the prompt.`,
    );
}

function imageMimeTypeOf(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPE_BY_EXTENSION[extension];
    if (!mimeType) {
        throw new ActionError(
            'UNSUPPORTED_FILE_TYPE',
            `"${path.basename(filePath)}" is not a supported image (jpg, jpeg, png, webp, gif).`,
        );
    }
    return mimeType;
}

import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

/**
 * Upload one image into the Media Manager folder `media` and wait until Wix has processed it
 * (DL #40). REST via `wixFetch` — the same call sequence wix-media uses, without depending on it.
 * Wix API rejections propagate as `WixApiError`; upload/processing failures as `MediaUploadError`.
 */

export const MEDIA_FOLDER_NAME = 'media';
const MEDIA_ROOT_FOLDER_ID = 'media-root';
const FILES_PAGE_SIZE = 100;

export interface ImageUpload {
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
}

export interface ReadinessPolling {
    timeoutMs: number;
    intervalMs: number;
    sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_POLLING: ReadinessPolling = { timeoutMs: 30_000, intervalMs: 1_000 };

export type MediaUploadErrorCode = 'MEDIA_UPLOAD_FAILED' | 'MEDIA_FILE_NOT_READY';

export class MediaUploadError extends Error {
    override readonly name = 'MediaUploadError';
    constructor(
        readonly code: MediaUploadErrorCode,
        message: string,
    ) {
        super(message);
    }
}

/** Returns the Media Manager file id of the uploaded, READY image. */
export async function uploadImageToMediaFolder(
    client: WixClient,
    upload: ImageUpload,
    polling: ReadinessPolling = DEFAULT_POLLING,
): Promise<string> {
    const folderId = await findOrCreateMediaFolder(client);
    await putFile(await generateUploadUrl(client, upload, folderId), upload);
    const fileId = await findNewestFileByName(client, folderId, upload.fileName);
    await waitUntilReady(client, fileId, polling);
    return fileId;
}

// ============================================================================
// Steps
// ============================================================================

interface MediaFolder {
    id?: string;
    displayName?: string;
}

interface MediaFile {
    id?: string;
    displayName?: string;
    state?: string;
    createdDate?: string;
    operationStatus?: string;
}

async function findOrCreateMediaFolder(client: WixClient): Promise<string> {
    const query = new URLSearchParams({ parentFolderId: MEDIA_ROOT_FOLDER_ID });
    const { folders } = await wixFetch<{ folders?: MediaFolder[] }>(
        client,
        `/site-media/v1/folders?${query}`,
        { method: 'GET' },
    );
    const existing = folders?.find((folder) => folder.displayName === MEDIA_FOLDER_NAME);
    if (existing?.id) return existing.id;

    const { folder } = await wixFetch<{ folder?: MediaFolder }>(client, '/site-media/v1/folders', {
        method: 'POST',
        body: { displayName: MEDIA_FOLDER_NAME, parentFolderId: MEDIA_ROOT_FOLDER_ID },
    });
    if (!folder?.id) {
        throw new MediaUploadError(
            'MEDIA_UPLOAD_FAILED',
            'Wix did not return the "media" folder id.',
        );
    }
    return folder.id;
}

async function generateUploadUrl(
    client: WixClient,
    upload: ImageUpload,
    parentFolderId: string,
): Promise<string> {
    const { uploadUrl } = await wixFetch<{ uploadUrl?: string }>(
        client,
        '/site-media/v1/files/generate-upload-url',
        {
            method: 'POST',
            body: {
                mimeType: upload.mimeType,
                fileName: upload.fileName,
                parentFolderId,
                sizeInBytes: String(upload.bytes.length),
            },
        },
    );
    if (!uploadUrl) {
        throw new MediaUploadError('MEDIA_UPLOAD_FAILED', 'Wix did not return an upload URL.');
    }
    return uploadUrl;
}

async function putFile(uploadUrl: string, upload: ImageUpload): Promise<void> {
    const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': upload.mimeType },
        body: upload.bytes,
    });
    if (!response.ok) {
        throw new MediaUploadError(
            'MEDIA_UPLOAD_FAILED',
            `Uploading "${upload.fileName}" failed with status ${response.status}.`,
        );
    }
}

/** The PUT response is not relied on: the file is found in its folder by name (as wix-media does). */
async function findNewestFileByName(
    client: WixClient,
    folderId: string,
    fileName: string,
): Promise<string> {
    const matches = (await listFolderFiles(client, folderId)).filter(
        (file) => file.state === 'OK' && file.displayName === fileName && file.id,
    );
    const newest = matches.sort((a, b) =>
        (b.createdDate ?? '').localeCompare(a.createdDate ?? ''),
    )[0];
    if (!newest?.id) {
        throw new MediaUploadError(
            'MEDIA_UPLOAD_FAILED',
            `"${fileName}" was uploaded but is not listed in the Media Manager "${MEDIA_FOLDER_NAME}" folder.`,
        );
    }
    return newest.id;
}

async function listFolderFiles(client: WixClient, folderId: string): Promise<MediaFile[]> {
    const files: MediaFile[] = [];
    let cursor = '';
    do {
        const query = new URLSearchParams({
            parentFolderId: folderId,
            'paging.limit': String(FILES_PAGE_SIZE),
        });
        if (cursor) query.set('paging.cursor', cursor);
        const page = await wixFetch<{
            files?: MediaFile[];
            nextCursor?: { cursors?: { next?: string } };
        }>(client, `/site-media/v1/files?${query}`, { method: 'GET' });
        files.push(...(page.files ?? []));
        cursor = page.nextCursor?.cursors?.next ?? '';
    } while (cursor);
    return files;
}

async function waitUntilReady(
    client: WixClient,
    fileId: string,
    polling: ReadinessPolling,
): Promise<void> {
    const sleep = polling.sleep ?? defaultSleep;
    for (let waitedMs = 0; ; waitedMs += polling.intervalMs) {
        const status = await readOperationStatus(client, fileId);
        if (status === 'READY') return;
        if (status === 'FAILED') {
            throw new MediaUploadError('MEDIA_UPLOAD_FAILED', `Wix failed to process "${fileId}".`);
        }
        if (waitedMs >= polling.timeoutMs) {
            throw new MediaUploadError(
                'MEDIA_FILE_NOT_READY',
                `"${fileId}" was still processing after ${polling.timeoutMs / 1000}s; try again.`,
            );
        }
        await sleep(polling.intervalMs);
    }
}

async function readOperationStatus(client: WixClient, fileId: string): Promise<string> {
    const query = new URLSearchParams({ fileId });
    const { file } = await wixFetch<{ file?: MediaFile }>(
        client,
        `/site-media/v1/files/get-file-by-id?${query}`,
        { method: 'GET' },
    );
    return file?.operationStatus ?? '';
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

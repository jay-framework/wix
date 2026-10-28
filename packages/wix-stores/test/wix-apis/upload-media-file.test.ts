// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WixClient } from '@wix/sdk';
import { wixFetch, WixApiError } from '@jay-framework/wix-server-client';
import {
    MediaUploadError,
    uploadImageToMediaFolder,
} from '../../lib/wix-apis/upload-media-file.js';

vi.mock('@jay-framework/wix-server-client', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@jay-framework/wix-server-client')>()),
    wixFetch: vi.fn(),
}));

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'upload-media-file');

async function readFixture<T = unknown>(name: string): Promise<T> {
    return JSON.parse(await readFile(path.join(fixturesDir, name), 'utf-8')) as T;
}

const wixClient = {} as WixClient;
const mockedWixFetch = vi.mocked(wixFetch);
const mockedFetch = vi.fn();
const upload = {
    fileName: 'cap back.jpeg',
    mimeType: 'image/jpeg',
    bytes: new Uint8Array([1, 2, 3, 4]),
};
const instantPolling = { timeoutMs: 3, intervalMs: 1, sleep: () => Promise.resolve() };

async function respondWith(...fixtureNamesOrErrors: Array<string | Error>) {
    for (const entry of fixtureNamesOrErrors) {
        if (entry instanceof Error) mockedWixFetch.mockRejectedValueOnce(entry);
        else mockedWixFetch.mockResolvedValueOnce(await readFixture(entry));
    }
}

function requestedCalls() {
    return mockedWixFetch.mock.calls.map(([client, requestPath, options]) => {
        expect(client).toBe(wixClient);
        return [requestPath, options];
    });
}

beforeEach(() => {
    mockedWixFetch.mockReset();
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockedFetch);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('uploadImageToMediaFolder', () => {
    it('creates the media folder, uploads, finds the newest OK file by name and waits for READY', async () => {
        await respondWith(
            'list-folders-root.json',
            'create-folder-response.json',
            'generate-upload-url-response.json',
            'list-files-page-1.json',
            'list-files-page-2.json',
            'get-file-pending.json',
            'get-file-ready.json',
        );

        const fileId = await uploadImageToMediaFolder(wixClient, upload, instantPolling);

        expect(fileId).toBe('a73159_new~mv2.jpeg');
        expect(requestedCalls()).toEqual(
            await readFixture('expected-upload-calls-new-folder.json'),
        );
        expect(mockedFetch).toHaveBeenCalledWith('https://upload.wixmp.com/upload/abc', {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: upload.bytes,
        });
    });

    it('reuses an existing root-level media folder', async () => {
        await respondWith(
            'list-folders-root-with-media.json',
            'generate-upload-url-response.json',
            'list-files-page-2.json',
            'get-file-ready.json',
        );

        await uploadImageToMediaFolder(wixClient, upload, instantPolling);

        const paths = requestedCalls().map(([requestPath]) => requestPath);
        expect(paths).toEqual([
            '/site-media/v1/folders?parentFolderId=media-root',
            '/site-media/v1/files/generate-upload-url',
            '/site-media/v1/files?parentFolderId=folder-media&paging.limit=100',
            '/site-media/v1/files/get-file-by-id?fileId=a73159_new%7Emv2.jpeg',
        ]);
    });

    it('fails with MEDIA_UPLOAD_FAILED when the PUT is rejected', async () => {
        await respondWith('list-folders-root-with-media.json', 'generate-upload-url-response.json');
        mockedFetch.mockResolvedValueOnce(new Response('nope', { status: 500 }));

        await expect(
            uploadImageToMediaFolder(wixClient, upload, instantPolling),
        ).rejects.toMatchObject({ name: 'MediaUploadError', code: 'MEDIA_UPLOAD_FAILED' });
    });

    it('fails with MEDIA_UPLOAD_FAILED when the uploaded file is not in the folder', async () => {
        await respondWith(
            'list-folders-root-with-media.json',
            'generate-upload-url-response.json',
            'list-folders-root.json',
        );

        await expect(
            uploadImageToMediaFolder(wixClient, upload, instantPolling),
        ).rejects.toMatchObject({ code: 'MEDIA_UPLOAD_FAILED' });
    });

    it('fails with MEDIA_FILE_NOT_READY when the file stays pending past the timeout', async () => {
        await respondWith(
            'list-folders-root-with-media.json',
            'generate-upload-url-response.json',
            'list-files-page-2.json',
        );
        mockedWixFetch.mockResolvedValue(await readFixture('get-file-pending.json'));

        await expect(
            uploadImageToMediaFolder(wixClient, upload, instantPolling),
        ).rejects.toMatchObject({ code: 'MEDIA_FILE_NOT_READY' });
    });

    it('fails with MEDIA_UPLOAD_FAILED when Wix reports processing FAILED', async () => {
        await respondWith(
            'list-folders-root-with-media.json',
            'generate-upload-url-response.json',
            'list-files-page-2.json',
            'get-file-failed.json',
        );

        await expect(
            uploadImageToMediaFolder(wixClient, upload, instantPolling),
        ).rejects.toMatchObject({ code: 'MEDIA_UPLOAD_FAILED' });
    });

    it('lets a Wix API rejection (e.g. 403) propagate as WixApiError', async () => {
        await respondWith(new WixApiError(403, '/site-media/v1/folders', 'forbidden'));

        await expect(
            uploadImageToMediaFolder(wixClient, upload, instantPolling),
        ).rejects.toBeInstanceOf(WixApiError);
    });

    it('MediaUploadError carries its code', () => {
        expect(new MediaUploadError('MEDIA_UPLOAD_FAILED', 'x')).toMatchObject({
            name: 'MediaUploadError',
            code: 'MEDIA_UPLOAD_FAILED',
            message: 'x',
        });
    });
});

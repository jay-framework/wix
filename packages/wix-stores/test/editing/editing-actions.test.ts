// @vitest-environment node

import { mkdtemp, readFile, truncate, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WixClient } from '@wix/sdk';
import { wixFetch, WixApiError } from '@jay-framework/wix-server-client';
import {
    getProductForEditing,
    updateProductImage,
    updateProductText,
} from '../../lib/editing/editing-actions.js';
import type { WixStoresService } from '../../lib/services/wix-stores-service.js';
import {
    MediaUploadError,
    uploadImageToMediaFolder,
} from '../../lib/wix-apis/upload-media-file.js';

vi.mock('../../lib/wix-apis/upload-media-file.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../lib/wix-apis/upload-media-file.js')>()),
    uploadImageToMediaFolder: vi.fn(),
}));

vi.mock('@jay-framework/wix-server-client', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@jay-framework/wix-server-client')>()),
    wixFetch: vi.fn(),
}));

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'editing-actions');

async function readFixture<T = unknown>(name: string): Promise<T> {
    return JSON.parse(await readFile(path.join(fixturesDir, name), 'utf-8')) as T;
}

const wixClient = {} as WixClient;
const wixStores = { wixClient } as WixStoresService;
const mockedWixFetch = vi.mocked(wixFetch);
const mockedUpload = vi.mocked(uploadImageToMediaFolder);
const imageFilesDir = path.join(__dirname, '..', 'fixtures', 'image-files');
const CAP_BACK_FILE = path.join(imageFilesDir, 'cap back.JPEG');

/** Script wixFetch: each call consumes the next response (a value resolves, an Error rejects). */
function respondWith(...responses: unknown[]) {
    for (const response of responses) {
        if (response instanceof Error) mockedWixFetch.mockRejectedValueOnce(response);
        else mockedWixFetch.mockResolvedValueOnce(response);
    }
}

/** wixFetch calls as [path, options] (the client is always the service's wixClient). */
function requestedCalls() {
    return mockedWixFetch.mock.calls.map(([client, requestPath, options]) => {
        expect(client).toBe(wixClient);
        return [requestPath, options];
    });
}

const conflict = () => new WixApiError(409, '/stores/v3/products/prod-air-runner', 'conflict');
const NEW_IMAGE_URL = 'https://example.com/red-sneaker.jpg';

beforeEach(() => {
    mockedWixFetch.mockReset();
    mockedUpload.mockReset();
});

describe('getProductForEditing', () => {
    it('resolves a product by slug and returns its editable fields', async () => {
        respondWith(await readFixture('get-product-response.json'));

        const output = await getProductForEditing.handler({ slug: 'air-runner' }, wixStores);

        expect(output).toEqual(await readFixture('expected-get-product-for-editing-output.json'));
        expect(requestedCalls()).toEqual(
            await readFixture('expected-get-product-by-slug-calls.json'),
        );
    });

    it('resolves a product by productId', async () => {
        respondWith(await readFixture('get-product-response.json'));

        await getProductForEditing.handler({ productId: 'prod-air-runner' }, wixStores);

        expect(requestedCalls()).toEqual(
            await readFixture('expected-get-product-by-id-calls.json'),
        );
    });
});

describe('updateProductImage', () => {
    it('reads the current revision, then PATCHes the media items with it', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            await readFixture('update-image-response.json'),
        );

        const output = await updateProductImage.handler(
            { slug: 'air-runner', imageUrl: NEW_IMAGE_URL },
            wixStores,
        );

        expect(requestedCalls()).toEqual(await readFixture('expected-update-image-calls.json'));
        expect(output).toEqual(await readFixture('expected-update-image-output.json'));
    });

    it('re-reads the product and retries once when the write hits a revision conflict (409)', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            conflict(),
            await readFixture('get-product-response-revision-8.json'),
            await readFixture('update-image-response.json'),
        );

        const output = await updateProductImage.handler(
            { productId: 'prod-air-runner', imageUrl: NEW_IMAGE_URL },
            wixStores,
        );

        expect(requestedCalls()).toEqual(
            await readFixture('expected-update-image-retry-calls.json'),
        );
        expect(output).toEqual(await readFixture('expected-update-image-retry-output.json'));
    });

    it('fails with REVISION_CONFLICT when the retry conflicts too', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            conflict(),
            await readFixture('get-product-response-revision-8.json'),
            conflict(),
        );

        await expect(
            updateProductImage.handler({ slug: 'air-runner', imageUrl: NEW_IMAGE_URL }, wixStores),
        ).rejects.toMatchObject({ name: 'ActionError', code: 'REVISION_CONFLICT' });
        expect(mockedWixFetch).toHaveBeenCalledTimes(4);
    });

    it('fails with INVALID_IMAGE_URL for a non-URL image, without calling Wix', async () => {
        await expect(
            updateProductImage.handler(
                { slug: 'air-runner', imageUrl: 'a red sneaker' },
                wixStores,
            ),
        ).rejects.toMatchObject({ name: 'ActionError', code: 'INVALID_IMAGE_URL' });
        expect(mockedWixFetch).not.toHaveBeenCalled();
    });
});

describe('updateProductImage — gallery item and local file (DL #40)', () => {
    it('uploads the local file and replaces the gallery item with mediaId in place', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            await readFixture('get-product-response.json'),
            await readFixture('update-gallery-image-response.json'),
        );
        mockedUpload.mockResolvedValueOnce('a73159_new~mv2.jpeg');

        const output = await updateProductImage.handler(
            {
                slug: 'air-runner',
                mediaId: 'c837a6_back~mv2.jpg',
                imageFile: CAP_BACK_FILE,
                altText: 'Cap, back',
            },
            wixStores,
        );

        expect(mockedUpload).toHaveBeenCalledWith(wixClient, {
            fileName: 'cap back.JPEG',
            mimeType: 'image/jpeg',
            bytes: new Uint8Array([1, 2, 3, 4]),
        });
        expect(requestedCalls()).toEqual(
            await readFixture('expected-update-gallery-image-from-file-calls.json'),
        );
        expect(output).toEqual(
            await readFixture('expected-update-gallery-image-from-file-output.json'),
        );
    });

    it('resolves a relative imageFile against the project root (cwd)', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            await readFixture('update-image-response.json'),
        );
        mockedUpload.mockResolvedValueOnce('c837a6_red~mv2.jpg');

        await updateProductImage.handler(
            { slug: 'air-runner', imageFile: path.relative(process.cwd(), CAP_BACK_FILE) },
            wixStores,
        );

        expect(mockedUpload).toHaveBeenCalledWith(
            wixClient,
            expect.objectContaining({ fileName: 'cap back.JPEG' }),
        );
    });

    it.each([
        ['neither imageUrl nor imageFile', { slug: 'air-runner' }],
        [
            'both imageUrl and imageFile',
            { slug: 'air-runner', imageUrl: NEW_IMAGE_URL, imageFile: CAP_BACK_FILE },
        ],
    ])('fails with IMAGE_SOURCE_REQUIRED for %s, without calling Wix', async (_, input) => {
        await expect(updateProductImage.handler(input, wixStores)).rejects.toMatchObject({
            name: 'ActionError',
            code: 'IMAGE_SOURCE_REQUIRED',
        });
        expect(mockedWixFetch).not.toHaveBeenCalled();
    });

    it.each([
        ['FILE_NOT_FOUND', path.join(imageFilesDir, 'missing.jpg')],
        ['UNSUPPORTED_FILE_TYPE', path.join(imageFilesDir, 'notes.txt')],
    ])('fails with %s before calling Wix', async (code, imageFile) => {
        await expect(
            updateProductImage.handler({ slug: 'air-runner', imageFile }, wixStores),
        ).rejects.toMatchObject({ name: 'ActionError', code });
        expect(mockedWixFetch).not.toHaveBeenCalled();
        expect(mockedUpload).not.toHaveBeenCalled();
    });

    it('fails with FILE_TOO_LARGE for a file over 10 MB', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'wix-stores-image-'));
        const bigFile = path.join(dir, 'big.png');
        await writeFile(bigFile, '');
        await truncate(bigFile, 10 * 1024 * 1024 + 1);

        await expect(
            updateProductImage.handler({ slug: 'air-runner', imageFile: bigFile }, wixStores),
        ).rejects.toMatchObject({ name: 'ActionError', code: 'FILE_TOO_LARGE' });
        expect(mockedWixFetch).not.toHaveBeenCalled();
    });

    it('fails with MEDIA_ITEM_NOT_FOUND for an unknown mediaId, before uploading', async () => {
        respondWith(await readFixture('get-product-response.json'));

        await expect(
            updateProductImage.handler(
                { slug: 'air-runner', mediaId: 'nope', imageFile: CAP_BACK_FILE },
                wixStores,
            ),
        ).rejects.toMatchObject({ name: 'ActionError', code: 'MEDIA_ITEM_NOT_FOUND' });
        expect(mockedUpload).not.toHaveBeenCalled();
    });

    it.each([401, 403])(
        'fails with MEDIA_UPLOAD_NOT_AUTHORIZED when a Media call is rejected with %i',
        async (status) => {
            mockedUpload.mockRejectedValueOnce(
                new WixApiError(status, '/site-media/v1/folders', 'forbidden'),
            );

            await expect(
                updateProductImage.handler(
                    { slug: 'air-runner', imageFile: CAP_BACK_FILE },
                    wixStores,
                ),
            ).rejects.toMatchObject({ name: 'ActionError', code: 'MEDIA_UPLOAD_NOT_AUTHORIZED' });
        },
    );

    it.each(['MEDIA_UPLOAD_FAILED', 'MEDIA_FILE_NOT_READY'] as const)(
        'surfaces %s from the upload as an ActionError',
        async (code) => {
            mockedUpload.mockRejectedValueOnce(new MediaUploadError(code, 'upload problem'));

            await expect(
                updateProductImage.handler(
                    { slug: 'air-runner', imageFile: CAP_BACK_FILE },
                    wixStores,
                ),
            ).rejects.toMatchObject({ name: 'ActionError', code });
        },
    );
});

describe('updateProductText', () => {
    it('PATCHes only the given text fields with the current revision', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            await readFixture('update-text-response.json'),
        );

        const output = await updateProductText.handler(
            { slug: 'air-runner', name: 'Air Runner Pro' },
            wixStores,
        );

        expect(requestedCalls()).toEqual(await readFixture('expected-update-text-calls.json'));
        expect(output).toEqual(await readFixture('expected-update-text-output.json'));
    });

    it('fails with NOTHING_TO_UPDATE when neither name nor plainDescription is given', async () => {
        await expect(
            updateProductText.handler({ slug: 'air-runner' }, wixStores),
        ).rejects.toMatchObject({ name: 'ActionError', code: 'NOTHING_TO_UPDATE' });
        expect(mockedWixFetch).not.toHaveBeenCalled();
    });
});

describe('editing action errors', () => {
    it.each([
        ['getProductForEditing', () => getProductForEditing.handler({}, wixStores)],
        [
            'updateProductImage',
            () => updateProductImage.handler({ imageUrl: NEW_IMAGE_URL }, wixStores),
        ],
        ['updateProductText', () => updateProductText.handler({ name: 'x' }, wixStores)],
    ])('%s fails with MISSING_PRODUCT_IDENTITY without slug or productId', async (_, run) => {
        await expect(run()).rejects.toMatchObject({
            name: 'ActionError',
            code: 'MISSING_PRODUCT_IDENTITY',
        });
        expect(mockedWixFetch).not.toHaveBeenCalled();
    });

    it('fails with PRODUCT_NOT_FOUND when the slug does not exist (404)', async () => {
        respondWith(new WixApiError(404, '/stores/v3/products/slug/nope', 'not found'));

        await expect(
            updateProductImage.handler({ slug: 'nope', imageUrl: NEW_IMAGE_URL }, wixStores),
        ).rejects.toMatchObject({ name: 'ActionError', code: 'PRODUCT_NOT_FOUND' });
    });

    it.each([401, 403])(
        'fails with WRITE_NOT_AUTHORIZED when the write is rejected with %i',
        async (status) => {
            respondWith(
                await readFixture('get-product-response.json'),
                new WixApiError(status, '/stores/v3/products/prod-air-runner', 'forbidden'),
            );

            await expect(
                updateProductText.handler({ slug: 'air-runner', name: 'x' }, wixStores),
            ).rejects.toMatchObject({
                name: 'ActionError',
                code: 'WRITE_NOT_AUTHORIZED',
                message: expect.stringContaining('apiKeyStrategy'),
            });
        },
    );
});

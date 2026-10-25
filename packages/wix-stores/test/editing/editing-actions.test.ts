// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WixClient } from '@wix/sdk';
import { wixFetch, WixApiError } from '@jay-framework/wix-server-client';
import {
    getProductForEditing,
    updateProductMainImage,
    updateProductText,
} from '../../lib/editing/editing-actions.js';
import type { WixStoresService } from '../../lib/services/wix-stores-service.js';

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

describe('updateProductMainImage', () => {
    it('reads the current revision, then PATCHes the media items with it', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            await readFixture('update-main-image-response.json'),
        );

        const output = await updateProductMainImage.handler(
            { slug: 'air-runner', imageUrl: NEW_IMAGE_URL },
            wixStores,
        );

        expect(requestedCalls()).toEqual(
            await readFixture('expected-update-main-image-calls.json'),
        );
        expect(output).toEqual(await readFixture('expected-update-main-image-output.json'));
    });

    it('re-reads the product and retries once when the write hits a revision conflict (409)', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            conflict(),
            await readFixture('get-product-response-revision-8.json'),
            await readFixture('update-main-image-response.json'),
        );

        const output = await updateProductMainImage.handler(
            { productId: 'prod-air-runner', imageUrl: NEW_IMAGE_URL },
            wixStores,
        );

        expect(requestedCalls()).toEqual(
            await readFixture('expected-update-main-image-retry-calls.json'),
        );
        expect(output).toEqual(await readFixture('expected-update-main-image-output.json'));
    });

    it('fails with REVISION_CONFLICT when the retry conflicts too', async () => {
        respondWith(
            await readFixture('get-product-response.json'),
            conflict(),
            await readFixture('get-product-response-revision-8.json'),
            conflict(),
        );

        await expect(
            updateProductMainImage.handler(
                { slug: 'air-runner', imageUrl: NEW_IMAGE_URL },
                wixStores,
            ),
        ).rejects.toMatchObject({ name: 'ActionError', code: 'REVISION_CONFLICT' });
        expect(mockedWixFetch).toHaveBeenCalledTimes(4);
    });

    it('fails with INVALID_IMAGE_URL for a non-URL image, without calling Wix', async () => {
        await expect(
            updateProductMainImage.handler(
                { slug: 'air-runner', imageUrl: 'a red sneaker' },
                wixStores,
            ),
        ).rejects.toMatchObject({ name: 'ActionError', code: 'INVALID_IMAGE_URL' });
        expect(mockedWixFetch).not.toHaveBeenCalled();
    });
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
            'updateProductMainImage',
            () => updateProductMainImage.handler({ imageUrl: NEW_IMAGE_URL }, wixStores),
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
            updateProductMainImage.handler({ slug: 'nope', imageUrl: NEW_IMAGE_URL }, wixStores),
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

// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import { updateProduct } from '../../lib/wix-apis/update-product.js';

vi.mock('@jay-framework/wix-server-client', () => ({ wixFetch: vi.fn() }));

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'edit-main-image');

async function readFixture<T>(name: string): Promise<T> {
    return JSON.parse(await readFile(path.join(fixturesDir, name), 'utf-8')) as T;
}

const client = {} as WixClient;
const mockedWixFetch = vi.mocked(wixFetch);

describe('updateProduct', () => {
    beforeEach(() => {
        mockedWixFetch.mockReset();
    });

    it('PATCHes the product with id + revision + patch and the requested fields', async () => {
        mockedWixFetch.mockResolvedValue(await readFixture('update-product-response.json'));
        const expected = await readFixture<{ path: string; options: unknown }>(
            'update-product-request.json',
        );

        await updateProduct(
            client,
            {
                id: 'prod-air-runner',
                revision: '7',
                media: {
                    itemsInfo: {
                        items: [
                            { url: 'https://example.com/red-sneaker.jpg' },
                            { id: 'c837a6_back~mv2.jpg' },
                        ],
                    },
                },
            },
            { fields: ['MEDIA_ITEMS_INFO'] },
        );

        expect(mockedWixFetch.mock.calls).toEqual([[client, expected.path, expected.options]]);
    });

    it('returns the updated product normalized to the read shape', async () => {
        mockedWixFetch.mockResolvedValue(await readFixture('update-product-response.json'));

        const result = await updateProduct(client, { id: 'prod-air-runner', revision: '7' });

        expect(result).toEqual(await readFixture('expected-update-product-result.json'));
    });
});

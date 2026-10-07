// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/wix-server-client', () => ({ wixFetch: vi.fn() }));

import { wixFetch } from '@jay-framework/wix-server-client';
import { queryProducts } from '../lib/wix-apis/query-products.js';

const mockFetch = vi.mocked(wixFetch);
const client = {} as Parameters<typeof queryProducts>[0];
const sentBody = () =>
    mockFetch.mock.calls[0][2]!.body as {
        query: Record<string, unknown>;
        includeMerchantSpecificData: boolean;
    };

describe('queryProducts (V1)', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({ products: [] });
    });

    it('does not request merchant-specific data by default (storefront clients get 403)', async () => {
        await queryProducts(client, { paging: { limit: 1 } });
        expect(sentBody().includeMerchantSpecificData).toBe(false);
    });

    it('still requests merchant-specific data when asked explicitly', async () => {
        await queryProducts(client, { includeMerchantSpecificData: true });
        expect(sentBody().includeMerchantSpecificData).toBe(true);
    });

    it.each`
        sort                                           | expected
        ${undefined}                                   | ${'[{"numericId":"asc"}]'}
        ${[{ fieldName: 'price', order: 'DESC' }]}     | ${'[{"price":"desc"},{"numericId":"asc"}]'}
        ${[{ fieldName: 'numericId', order: 'DESC' }]} | ${'[{"numericId":"desc"}]'}
    `('adds a numericId tiebreaker when paging (sort: $expected)', async ({ sort, expected }) => {
        await queryProducts(client, { sort, paging: { limit: 100, offset: 100 } });
        expect(sentBody().query.sort).toBe(expected);
    });

    it('leaves unpaged queries unsorted', async () => {
        await queryProducts(client, { filter: { slug: 'x' } });
        expect(sentBody().query.sort).toBeUndefined();
    });
});

import type { WixClient } from '@wix/sdk';
import {
    wixFetch,
    type WixFilter,
    type WixSort,
    type WixPaging,
} from '@jay-framework/wix-server-client';
import type { QueryProductsResponse } from './types.js';
import { normalizeProducts } from './normalize-product.js';

export interface QueryProductsRequest {
    filter?: WixFilter;
    sort?: WixSort[];
    paging?: WixPaging;
    fields?: string[];
}

export async function queryProducts(
    client: WixClient,
    query: QueryProductsRequest,
): Promise<QueryProductsResponse> {
    const result = await wixFetch<QueryProductsResponse>(client, '/stores/v3/products/query', {
        method: 'POST',
        body: {
            query: {
                filter: query.filter,
                sort: query.sort,
                paging: query.paging,
            },
            ...(query.fields ? { fields: query.fields } : {}),
        },
    });
    if (result.products) {
        result.products = normalizeProducts(result.products as Record<string, unknown>[]);
    }
    return result;
}

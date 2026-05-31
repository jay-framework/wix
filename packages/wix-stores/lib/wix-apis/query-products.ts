import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { QueryProductsResponse, Paging } from './types.js';
import type { ProductFilter, SearchSort } from './search-products.js';

export interface QueryProductsRequest {
    filter?: ProductFilter;
    sort?: SearchSort[];
    paging?: Paging;
    fields?: string[];
}

export async function queryProducts(
    client: WixClient,
    query: QueryProductsRequest,
): Promise<QueryProductsResponse> {
    return wixFetch(client, '/stores/v3/products/query', {
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
}

import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { QueryCategoriesResponse, Paging } from './types.js';
import type { ProductFilter, SearchSort } from './search-products.js';

export interface QueryCategoriesRequest {
    filter?: ProductFilter;
    sort?: SearchSort[];
    paging?: Paging;
    treeReference?: { appNamespace?: string };
}

export async function queryCategories(
    client: WixClient,
    options?: QueryCategoriesRequest,
): Promise<QueryCategoriesResponse> {
    return wixFetch(client, '/categories/v1/categories/query', {
        method: 'POST',
        body: {
            query: {
                filter: options?.filter,
                sort: options?.sort,
                paging: options?.paging,
            },
            treeReference: options?.treeReference || { appNamespace: '@wix/stores' },
        },
    });
}

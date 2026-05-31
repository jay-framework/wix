import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { QueryInventoryResponse, Paging } from './types.js';
import type { ProductFilter } from './search-products.js';

export interface QueryInventoryRequest {
    filter?: ProductFilter;
    paging?: Paging;
}

export async function queryInventory(
    client: WixClient,
    options?: QueryInventoryRequest,
): Promise<QueryInventoryResponse> {
    return wixFetch(client, '/stores/v3/inventoryItems/query', {
        method: 'POST',
        body: {
            query: {
                filter: options?.filter,
                paging: options?.paging,
            },
        },
    });
}

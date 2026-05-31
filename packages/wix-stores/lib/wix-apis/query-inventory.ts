import type { WixClient } from '@wix/sdk';
import { wixFetch, type WixFilter, type WixPaging } from '@jay-framework/wix-server-client';
import type { QueryInventoryResponse } from './types.js';

export interface QueryInventoryRequest {
    filter?: WixFilter;
    paging?: WixPaging;
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

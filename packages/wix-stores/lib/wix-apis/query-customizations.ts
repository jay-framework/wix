import type { WixClient } from '@wix/sdk';
import { wixFetch, type WixFilter, type WixPaging } from '@jay-framework/wix-server-client';
import type { Customization } from './types.js';

export interface QueryCustomizationsRequest {
    filter?: WixFilter;
    paging?: WixPaging;
}

export interface QueryCustomizationsResponse {
    customizations?: Customization[];
}

export async function queryCustomizations(
    client: WixClient,
    options?: QueryCustomizationsRequest,
): Promise<QueryCustomizationsResponse> {
    return wixFetch(client, '/stores/v3/customizations/query', {
        method: 'POST',
        body: {
            query: {
                filter: options?.filter,
                paging: options?.paging,
            },
        },
    });
}

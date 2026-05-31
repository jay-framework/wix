import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { QuerySchemasResponse } from './types.js';
import type { ProductFilter } from './search-products.js';

export interface QuerySchemasRequest {
    filter?: ProductFilter;
}

export async function querySchemas(
    client: WixClient,
    options?: QuerySchemasRequest,
): Promise<QuerySchemasResponse> {
    return wixFetch(client, '/data-extension-schema/v1/schemas/query', {
        method: 'POST',
        body: {
            query: {
                filter: options?.filter,
            },
        },
    });
}

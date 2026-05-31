import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { QuerySchemasResponse } from './types.js';

export async function querySchemas(
    client: WixClient,
    options?: { filter?: { namespace?: string } },
): Promise<QuerySchemasResponse> {
    const namespace = options?.filter?.namespace || '';
    const params = namespace ? `?fqdn=${encodeURIComponent(namespace)}` : '';
    return wixFetch(client, `/schema-service/v1/schemas${params}`, {
        method: 'GET',
    });
}

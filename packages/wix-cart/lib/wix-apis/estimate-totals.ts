import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { EstimateCurrentCartTotalsResponse } from './types.js';

export async function estimateCurrentCartTotals(
    client: WixClient,
): Promise<EstimateCurrentCartTotalsResponse> {
    return wixFetch(client, '/ecom/v1/carts/current/estimate-totals', {
        method: 'POST',
        body: {},
    });
}

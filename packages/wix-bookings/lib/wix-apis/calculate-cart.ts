import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface CalculateCartResponse {
    summary?: {
        priceSummary?: {
            total?: { amount?: string };
        };
    };
}

export async function calculateBookingCart(
    client: WixClient,
    cartId: string,
): Promise<CalculateCartResponse> {
    return wixFetch(client, `/ecom/v2/carts/${cartId}/calculate`, { method: 'POST', body: {} });
}

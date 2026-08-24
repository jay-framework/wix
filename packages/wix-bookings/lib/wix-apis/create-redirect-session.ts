import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface CreateRedirectSessionResponse {
    redirectSession?: { fullUrl?: string };
}

export async function createBookingRedirectSession(
    client: WixClient,
    cartId: string,
    postFlowUrl: string,
): Promise<CreateRedirectSessionResponse> {
    return wixFetch(client, '/headless/v1/redirect-session', {
        method: 'POST',
        body: {
            ecomCheckout: { checkoutId: cartId },
            callbacks: { postFlowUrl },
        },
    });
}

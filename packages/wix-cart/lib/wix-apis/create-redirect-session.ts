import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface CreateRedirectSessionResponse {
    redirectSession?: {
        id?: string;
        fullUrl?: string;
    };
}

export interface CreateRedirectSessionOptions {
    ecomCheckout?: { checkoutId: string };
    callbacks?: { postFlowUrl?: string };
}

export async function createRedirectSession(
    client: WixClient,
    options: CreateRedirectSessionOptions,
): Promise<CreateRedirectSessionResponse> {
    return wixFetch(client, '/redirects-api/v1/redirect-session', {
        method: 'POST',
        body: options,
    });
}

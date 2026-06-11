/**
 * wixFetch — call Wix REST APIs using SDK auth headers.
 *
 * Works with both ApiKeyStrategy (server) and OAuthStrategy (client).
 * The SDK client handles auth; we just get headers and call fetch.
 */

import type { WixClient } from '@wix/sdk';

const WIX_API_BASE = 'https://www.wixapis.com';

export interface WixFetchOptions {
    method?: string;
    body?: any;
}

export async function wixFetch<T = any>(
    client: WixClient,
    path: string,
    options: WixFetchOptions = {},
): Promise<T> {
    const { method = 'GET', body } = options;

    // Get auth headers from the SDK client (works for both ApiKey and OAuth)
    const auth = await (client.auth as any).getAuthHeaders();
    const headers: Record<string, string> = {
        ...auth.headers,
        'Content-Type': 'application/json',
    };

    const url = `${WIX_API_BASE}${path}`;
    console.log(`[wixFetch] ${method} ${url}`);

    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();

    if (!response.ok) {
        console.error(`[wixFetch] ${response.status}: ${text.substring(0, 300)}`);
        throw new Error(`Wix API ${response.status}: ${path} — ${text.substring(0, 200)}`);
    }

    return (text ? JSON.parse(text) : {}) as T;
}

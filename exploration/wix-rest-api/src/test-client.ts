/**
 * Client-side test: call Wix APIs via REST using OAuthStrategy auth.
 *
 * Tests:
 * 1. Get current cart via /ecom/v1/carts/current
 * 2. Query products via /stores/v3/products/query
 */

import { createClient, OAuthStrategy, type Tokens } from '@wix/sdk';

// TODO: set your OAuth client ID
const OAUTH_CLIENT_ID = '7acebe4d-221d-45f1-8553-493478ea017f';
const WIX_API_BASE = 'https://www.wixapis.com';
const TOKENS_KEY = 'wix_rest_test_tokens';

function storeTokens(tokens: Tokens) {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function getStoredTokens(): Tokens | null {
    const stored = localStorage.getItem(TOKENS_KEY);
    return stored ? JSON.parse(stored) : null;
}

async function wixFetch<T = any>(
    client: ReturnType<typeof createClient>,
    path: string,
    options: { method?: string; body?: any } = {},
): Promise<T> {
    const { method = 'GET', body } = options;
    const auth = await (client.auth as any).getAuthHeaders();

    const response = await fetch(`${WIX_API_BASE}${path}`, {
        method,
        headers: { ...auth.headers, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status}: ${text.substring(0, 200)}`);
    return (text ? JSON.parse(text) : {}) as T;
}

// UI
const log = document.getElementById('log')!;
function appendLog(msg: string) {
    log.textContent += msg + '\n';
}

async function main() {
    appendLog('Initializing OAuth client...');

    const existingTokens = getStoredTokens();
    const client = createClient({
        auth: OAuthStrategy({
            clientId: OAUTH_CLIENT_ID,
            tokens: existingTokens || undefined,
        }),
        modules: {},
    });

    if (!existingTokens) {
        appendLog('Generating visitor tokens...');
        const tokens = await client.auth.generateVisitorTokens();
        client.auth.setTokens(tokens);
        storeTokens(tokens);
        appendLog('Visitor tokens created');
    } else {
        appendLog(`Resumed session (role: ${(existingTokens.refreshToken as any)?.role})`);
    }

    // Test 1: Query products
    appendLog('\n=== Query Products (OAuth) ===');
    try {
        const result = await wixFetch<any>(client, '/stores/v3/products/query', {
            method: 'POST',
            body: { query: { paging: { limit: 3 } } },
        });
        appendLog(`Found ${result.products?.length} products`);
        for (const p of (result.products || []).slice(0, 3)) {
            appendLog(`  ${p.name} — ${p.priceData?.formatted?.price}`);
        }
    } catch (e: any) {
        appendLog(`ERROR: ${e.message}`);
    }

    // Test 2: Get current cart
    appendLog('\n=== Get Current Cart (OAuth) ===');
    try {
        const result = await wixFetch<any>(client, '/ecom/v1/carts/current');
        if (result.cart) {
            appendLog(`Cart ID: ${result.cart._id}`);
            appendLog(`Items: ${result.cart.lineItems?.length || 0}`);
        } else {
            appendLog('No cart (empty response — expected for new visitors)');
        }
    } catch (e: any) {
        appendLog(`Cart error (may be expected): ${e.message.substring(0, 100)}`);
    }

    appendLog('\n=== Done ===');
}

main().catch((err) => {
    appendLog(`Fatal: ${err.message}`);
});

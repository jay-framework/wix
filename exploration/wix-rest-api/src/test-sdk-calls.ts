/**
 * Browser-based SDK calls — use DevTools Network tab to capture actual requests.
 * Uses the real SDK modules so we can see exact request/response shapes.
 */

import { createClient, OAuthStrategy, type Tokens } from '@wix/sdk';
import { productsV3 } from '@wix/stores';
import { categories } from '@wix/categories';
import { currentCart } from '@wix/ecom';

const OAUTH_CLIENT_ID = '7acebe4d-221d-45f1-8553-493478ea017f';
const TOKENS_KEY = 'wix_sdk_capture_tokens';

const log = document.getElementById('log')!;
function appendLog(msg: string) {
    log.textContent += msg + '\n';
    log.scrollTop = log.scrollHeight;
}

// Init client
const stored = localStorage.getItem(TOKENS_KEY);
const client = createClient({
    auth: OAuthStrategy({
        clientId: OAUTH_CLIENT_ID,
        tokens: stored ? JSON.parse(stored) : undefined,
    }),
    modules: { productsV3, categories, currentCart },
});

if (!stored) {
    appendLog('Generating visitor tokens...');
    client.auth.generateVisitorTokens().then(tokens => {
        client.auth.setTokens(tokens);
        localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
        appendLog('Tokens ready');
    });
} else {
    appendLog('Tokens loaded from storage');
}

// Store first product ID for add-to-cart
let firstProductId: string | null = null;

// ========== Products ==========

(window as any).doSearchProducts = async () => {
    appendLog('\n--- searchProducts (with aggregations) ---');
    try {
        const result = await client.productsV3.searchProducts(
            {
                cursorPaging: { limit: 3 },
                aggregations: [
                    {
                        fieldPath: 'slug',
                        name: 'total-count',
                        type: 'SCALAR',
                        scalar: { type: 'COUNT_DISTINCT' },
                    },
                    {
                        fieldPath: 'actualPriceRange.minValue.amount',
                        name: 'min-price',
                        type: 'SCALAR',
                        scalar: { type: 'MIN' },
                    },
                    {
                        fieldPath: 'actualPriceRange.minValue.amount',
                        name: 'max-price',
                        type: 'SCALAR',
                        scalar: { type: 'MAX' },
                    },
                    {
                        fieldPath: 'actualPriceRange.minValue.amount',
                        name: 'price-buckets',
                        type: 'RANGE',
                        range: {
                            buckets: [
                                { from: 0, to: 25 },
                                { from: 25, to: 50 },
                                { from: 50, to: 100 },
                                { from: 100 },
                            ],
                        },
                    },
                ],
            },
            {
                fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'],
            },
        );
        firstProductId = result.products?.[0]?._id || null;
        appendLog(`Products: ${result.products?.length}`);
        appendLog(`Aggregation results: ${JSON.stringify(result.aggregationData, null, 2)?.substring(0, 500)}`);
        appendLog('Check Network tab for full request/response!');
    } catch (e: any) {
        appendLog(`ERROR: ${e.message}`);
    }
};

(window as any).doGetProductBySlug = async () => {
    appendLog('\n--- getProductBySlug ---');
    try {
        const result = await client.productsV3.getProductBySlug('crew-t-shirt', {
            fields: ['MEDIA_ITEMS_INFO', 'VARIANT_OPTION_CHOICE_NAMES'],
        });
        appendLog(`Product: ${result.product?.name}`);
        appendLog('Check Network tab for full request/response!');
    } catch (e: any) {
        appendLog(`ERROR: ${e.message}`);
    }
};

(window as any).doQueryProducts = async () => {
    appendLog('\n--- queryProducts ---');
    try {
        const result = await client.productsV3.queryProducts({
            fields: ['CURRENCY'],
        }).limit(3).find();
        firstProductId = result.items?.[0]?._id || null;
        appendLog(`Products: ${result.items?.length}`);
        appendLog('Check Network tab for full request/response!');
    } catch (e: any) {
        appendLog(`ERROR: ${e.message}`);
    }
};

// ========== Categories ==========

(window as any).doQueryCategories = async () => {
    appendLog('\n--- queryCategories ---');
    try {
        const result = await client.categories.queryCategories({
            treeReference: { appNamespace: '@wix/stores' },
        }).eq('visible', true).limit(10).find();
        appendLog(`Categories: ${result.items?.length}`);
        for (const cat of result.items || []) {
            appendLog(`  ${cat.name} (${cat.slug})`);
        }
        appendLog('Check Network tab for full request/response!');
    } catch (e: any) {
        appendLog(`ERROR: ${e.message}`);
    }
};

// ========== Cart ==========

(window as any).doGetCart = async () => {
    appendLog('\n--- getCurrentCart ---');
    try {
        const result = await client.currentCart.getCurrentCart();
        appendLog(`Cart: ${JSON.stringify(result, null, 2)?.substring(0, 300)}`);
    } catch (e: any) {
        appendLog(`Cart error (expected if empty): ${e.message?.substring(0, 100)}`);
    }
};

(window as any).doAddToCart = async () => {
    appendLog('\n--- addToCurrentCart ---');
    if (!firstProductId) {
        appendLog('No product ID — click "Search Products" or "Query Products" first');
        return;
    }
    try {
        const result = await client.currentCart.addToCurrentCart({
            lineItems: [{
                catalogReference: {
                    catalogItemId: firstProductId,
                    appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e',
                },
                quantity: 1,
            }],
        });
        appendLog(`Added to cart! Items: ${result.cart?.lineItems?.length}`);
        appendLog('Check Network tab for full request/response!');
    } catch (e: any) {
        appendLog(`ERROR: ${e.message}`);
    }
};

appendLog('Ready — click buttons above and watch the Network tab');

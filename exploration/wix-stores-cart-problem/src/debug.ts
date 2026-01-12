/**
 * Debug page - bare bone API test
 * Shows raw JSON results from Wix APIs
 * 
 * Tests the cart flow:
 * 1. Get current cart (expecting 404 for new visitors)
 * 2. Add a product to cart
 * 3. Get current cart again (should work now)
 * 4. Tokens are persisted in localStorage for session continuity
 */

import { initializeWixClient, getWixClient, getStoredTokens, clearStoredTokens, type WixStoresClient } from "./wix-client.js";

// Wix Stores app ID (required for catalog reference)
const WIX_STORES_APP_ID = '1380b703-ce81-ff05-f115-39571d94dfcd';

// ============================================================================
// DOM Helpers
// ============================================================================

function $(id: string): HTMLElement {
    return document.getElementById(id)!;
}

function showJson(elementId: string, data: unknown): void {
    const el = $(elementId);
    el.textContent = JSON.stringify(data, null, 2);
    el.style.color = '';
}

function showError(elementId: string, error: unknown): void {
    const el = $(elementId);
    el.textContent = error instanceof Error 
        ? `ERROR: ${error.message}\n\n${error.stack}`
        : `ERROR: ${JSON.stringify(error, null, 2)}`;
    el.style.color = 'red';
}

function showStatus(elementId: string, message: string, color: string = ''): void {
    const el = $(elementId);
    el.textContent = message;
    el.style.color = color;
}

function log(message: string): void {
    const logEl = $('log');
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    logEl.textContent += `[${timestamp}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

// ============================================================================
// Step 1: Get Current Cart (Expecting 404)
// ============================================================================

async function step1_getCurrentCart(): Promise<void> {
    log('Step 1: Getting current cart (expecting 404 for new visitors)...');
    showStatus('step1-status', 'Calling currentCart.getCurrentCart()...');
    
    try {
        const client = getWixClient();
        const cart = await client.currentCart.getCurrentCart();
        
        showStatus('step1-status', '✅ Cart exists!', 'green');
        showJson('step1-result', cart);
        log('Step 1: Cart found (visitor has existing cart)');
        
    } catch (error: any) {
        if (error?.details?.applicationError?.code === 'CART_NOT_FOUND') {
            showStatus('step1-status', '✅ Got expected 404 - No cart exists yet', 'orange');
            showJson('step1-result', {
                status: 404,
                message: 'Cart not found - this is expected for new visitors',
                errorCode: error?.details?.applicationError?.code,
                details: error?.details
            });
            log('Step 1: Got expected 404 (no cart for new visitor)');
        } else {
            showStatus('step1-status', '❌ Unexpected error', 'red');
            showError('step1-result', error);
            log('Step 1: FAILED with unexpected error');
        }
    }
}

// ============================================================================
// Step 2: Get Products to find one to add
// ============================================================================

async function step2_getProducts(): Promise<string | null> {
    log('Step 2: Fetching products to find one to add to cart...');
    showStatus('step2-status', 'Calling productsV3.queryProducts()...');
    
    try {
        const client = getWixClient();
        const response = await client.productsV3
            .queryProducts({ fields: ['CURRENCY'] })
            .limit(3)
            .find();
        
        const products = response.items || [];
        
        if (products.length === 0) {
            showStatus('step2-status', '⚠️ No products found', 'orange');
            showJson('step2-result', { message: 'No products in store' });
            log('Step 2: No products found');
            return null;
        }
        
        const firstProduct = products[0];
        const productId = firstProduct._id!;
        
        showStatus('step2-status', `✅ Found ${products.length} products`, 'green');
        showJson('step2-result', {
            totalProducts: products.length,
            selectedProduct: {
                id: productId,
                name: firstProduct.name,
                price: (firstProduct as any).priceData?.price,
            },
            allProducts: products.map(p => ({ id: p._id, name: p.name }))
        });
        log(`Step 2: Found product "${firstProduct.name}" (${productId})`);
        
        return productId;
        
    } catch (error) {
        showStatus('step2-status', '❌ Failed to fetch products', 'red');
        showError('step2-result', error);
        log('Step 2: FAILED to fetch products');
        return null;
    }
}

// ============================================================================
// Step 3: Add Product to Cart
// ============================================================================

async function step3_addToCart(productId: string): Promise<boolean> {
    log(`Step 3: Adding product ${productId} to cart...`);
    showStatus('step3-status', 'Calling currentCart.addToCurrentCart()...');
    
    try {
        const client = getWixClient();
        
        const result = await client.currentCart.addToCurrentCart({
            lineItems: [{
                catalogReference: {
                    catalogItemId: productId,
                    appId: WIX_STORES_APP_ID,
                },
                quantity: 1
            }]
        });
        
        showStatus('step3-status', '✅ Product added to cart!', 'green');
        showJson('step3-result', result);
        log('Step 3: Product added to cart successfully');
        
        return true;
        
    } catch (error) {
        showStatus('step3-status', '❌ Failed to add to cart', 'red');
        showError('step3-result', error);
        log('Step 3: FAILED to add to cart');
        return false;
    }
}

// ============================================================================
// Step 4: Get Current Cart (Should work now)
// ============================================================================

async function step4_getCurrentCartAfterAdd(): Promise<void> {
    log('Step 4: Getting current cart (should work now)...');
    showStatus('step4-status', 'Calling currentCart.getCurrentCart()...');
    
    try {
        const client = getWixClient();
        const cart = await client.currentCart.getCurrentCart();
        
        const lineItems = cart.lineItems || [];
        const itemCount = lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
        
        showStatus('step4-status', `✅ Cart retrieved! (${itemCount} items)`, 'green');
        showJson('step4-result', cart);
        log(`Step 4: Cart retrieved with ${itemCount} item(s)`);
        
    } catch (error: any) {
        if (error?.details?.applicationError?.code === 'CART_NOT_FOUND') {
            showStatus('step4-status', '❌ Still no cart (unexpected!)', 'red');
            showJson('step4-result', { error: 'Cart should exist after adding product!' });
            log('Step 4: FAILED - cart still not found after add');
        } else {
            showStatus('step4-status', '❌ Failed', 'red');
            showError('step4-result', error);
            log('Step 4: FAILED with error');
        }
    }
}

// ============================================================================
// Token Management Display
// ============================================================================

function updateTokenDisplay(): void {
    const tokens = getStoredTokens();
    
    if (tokens) {
        showStatus('tokens-status', '✅ Tokens found in localStorage', 'green');
        showJson('tokens-result', {
            hasAccessToken: !!tokens.accessToken,
            hasRefreshToken: !!tokens.refreshToken,
            accessTokenPreview: tokens.accessToken 
                ? `${tokens.accessToken.value?.substring(0, 30)}...` 
                : null,
        });
    } else {
        showStatus('tokens-status', '⚠️ No tokens in localStorage', 'orange');
        showJson('tokens-result', { message: 'Tokens will be created on initialization' });
    }
}

// ============================================================================
// Main Flow
// ============================================================================

async function runFullFlow(): Promise<void> {
    log('=== Starting Full Cart Flow ===');
    
    // Step 1: Try to get cart (expecting 404)
    await step1_getCurrentCart();
    
    // Step 2: Get products
    const productId = await step2_getProducts();
    
    if (productId) {
        // Step 3: Add to cart
        const added = await step3_addToCart(productId);
        
        if (added) {
            // Step 4: Get cart again
            await step4_getCurrentCartAfterAdd();
        }
    }
    
    // Update token display
    updateTokenDisplay();
    
    log('=== Flow Complete ===');
    log('Reload the page to test token persistence!');
}

async function main(): Promise<void> {
    // Show initial token state
    updateTokenDisplay();
    
    // Setup clear tokens button
    $('clear-tokens-btn').onclick = () => {
        clearStoredTokens();
        log('Tokens cleared from localStorage');
        updateTokenDisplay();
        alert('Tokens cleared! Reload the page to start fresh.');
    };
    
    // Setup run flow button
    $('run-flow-btn').onclick = async () => {
        log('--- Manual flow trigger ---');
        await runFullFlow();
    };
    
    try {
        showStatus('init-status', 'Initializing Wix client...');
        log('Initializing Wix client...');
        
        await initializeWixClient();
        
        showStatus('init-status', '✅ Client initialized', 'green');
        log('Client initialized successfully');
        
        // Update token display after init
        updateTokenDisplay();
        
        // Auto-run the flow
        await runFullFlow();
        
    } catch (error) {
        showStatus('init-status', '❌ Initialization failed', 'red');
        showError('init-result', error);
        log('FATAL: Initialization failed');
    }
}

main();

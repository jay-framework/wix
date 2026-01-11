/**
 * Main application entry point
 * 
 * Demonstrates calling Wix APIs:
 * - productsV3 for fetching products from Wix Stores
 * - currentCart for getting the visitor's shopping cart
 * 
 * Uses the module pattern where modules are initialized with the client.
 * @see https://dev.wix.com/docs/go-headless/develop-your-project/self-managed-headless/authentication/visitors/handle-visitors-using-the-js-sdk
 */

import { initializeWixClient, getWixClient } from "./wix-client.js";

// ============================================================================
// DOM Elements
// ============================================================================

function getElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element #${id} not found`);
    return el as T;
}

// ============================================================================
// Products API
// ============================================================================

interface ProductDisplay {
    id: string;
    name: string;
    slug: string;
    price: string;
    image?: string;
}

/**
 * Fetch products using productsV3 API
 * Uses the module pattern: client.productsV3.queryProducts()
 */
async function fetchProducts(): Promise<ProductDisplay[]> {
    const client = getWixClient();
    
    console.log('[Products] Querying products...');
    
    // Access productsV3 directly from the client (initialized with modules)
    const response = await client.productsV3
        .queryProducts({
            fields: [
                'CURRENCY',
                'MEDIA_ITEMS_INFO',
                'THUMBNAIL',
            ]
        })
        .limit(12)
        .find();
    
    console.log(`[Products] Found ${response.items?.length || 0} products`);
    
    return (response.items || []).map(product => ({
        id: product._id || '',
        name: product.name || 'Unnamed Product',
        slug: product.slug || '',
        price: formatPrice(product),
        image: getProductImage(product),
    }));
}

function formatPrice(product: any): string {
    const price = product.priceData?.price;
    const currency = product.priceData?.currency || 'USD';
    
    if (price === undefined || price === null) {
        return 'Price not available';
    }
    
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
    }).format(price);
}

function getProductImage(product: any): string | undefined {
    const media = product.media?.mainMedia?.image?.url;
    if (media) {
        // Wix images often need size parameters
        return `${media}`;
    }
    return undefined;
}

/**
 * Render products to the page
 */
function renderProducts(products: ProductDisplay[]): void {
    const container = getElement<HTMLDivElement>('products-container');
    
    if (products.length === 0) {
        container.innerHTML = '<p class="no-data">No products found</p>';
        return;
    }
    
    container.innerHTML = products.map(product => `
        <div class="product-card">
            ${product.image 
                ? `<img src="${product.image}" alt="${product.name}" class="product-image" />`
                : '<div class="product-image placeholder">No Image</div>'
            }
            <div class="product-info">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-price">${product.price}</p>
            </div>
        </div>
    `).join('');
}

// ============================================================================
// Cart API
// ============================================================================

interface CartDisplay {
    id: string;
    itemCount: number;
    subtotal: string;
    items: CartItemDisplay[];
}

interface CartItemDisplay {
    id: string;
    productName: string;
    quantity: number;
    price: string;
}

/**
 * Fetch the current visitor's cart using currentCart API
 * Uses the module pattern: client.currentCart.getCurrentCart()
 */
async function fetchCurrentCart(): Promise<CartDisplay | null> {
    const client = getWixClient();
    
    console.log('[Cart] Fetching current cart...');
    
    try {
        // Access currentCart directly from the client (initialized with modules)
        const cart = await client.currentCart.getCurrentCart();
        
        if (!cart) {
            console.log('[Cart] No cart found');
            return null;
        }
        
        console.log('[Cart] Cart retrieved:', cart._id);
        
        const lineItems = cart.lineItems || [];
        
        return {
            id: cart._id || '',
            itemCount: lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
            subtotal: formatCartSubtotal(cart),
            items: lineItems.map(item => ({
                id: item._id || '',
                productName: item.productName?.original || 'Unknown Product',
                quantity: item.quantity || 0,
                price: formatLineItemPrice(item),
            })),
        };
    } catch (error: any) {
        // Cart might not exist yet for new visitors
        if (error?.details?.applicationError?.code === 'CART_NOT_FOUND') {
            console.log('[Cart] Cart not found (new visitor)');
            return null;
        }
        throw error;
    }
}

function formatCartSubtotal(cart: any): string {
    const subtotal = cart.subtotal?.amount;
    const currency = cart.currency || 'USD';
    
    if (subtotal === undefined || subtotal === null) {
        return '$0.00';
    }
    
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
    }).format(parseFloat(subtotal));
}

function formatLineItemPrice(item: any): string {
    const price = item.price?.amount;
    const currency = item.price?.convertedAmount || 'USD';
    
    if (price === undefined || price === null) {
        return 'N/A';
    }
    
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: typeof currency === 'string' ? 'USD' : 'USD',
    }).format(parseFloat(price));
}

/**
 * Render cart to the page
 */
function renderCart(cart: CartDisplay | null): void {
    const container = getElement<HTMLDivElement>('cart-container');
    
    if (!cart || cart.items.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                <p>🛒 Your cart is empty</p>
                <p class="cart-hint">Add some products to see them here!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="cart-summary">
            <p><strong>Cart ID:</strong> ${cart.id.substring(0, 8)}...</p>
            <p><strong>Items:</strong> ${cart.itemCount}</p>
            <p><strong>Subtotal:</strong> ${cart.subtotal}</p>
        </div>
        <div class="cart-items">
            ${cart.items.map(item => `
                <div class="cart-item">
                    <span class="item-name">${item.productName}</span>
                    <span class="item-quantity">×${item.quantity}</span>
                    <span class="item-price">${item.price}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================================================
// UI State Management
// ============================================================================

function showLoading(elementId: string, message: string = 'Loading...'): void {
    const el = getElement<HTMLElement>(elementId);
    el.innerHTML = `<div class="loading">${message}</div>`;
}

function showError(elementId: string, error: Error): void {
    const el = getElement<HTMLElement>(elementId);
    el.innerHTML = `<div class="error">❌ ${error.message}</div>`;
}

function updateStatus(message: string, isError: boolean = false): void {
    const statusEl = getElement<HTMLDivElement>('status');
    statusEl.textContent = message;
    statusEl.className = `status ${isError ? 'error' : 'success'}`;
}

// ============================================================================
// Main Application
// ============================================================================

async function main(): Promise<void> {
    console.log('🚀 Starting Wix Static Page Demo...');
    
    try {
        // Show loading states
        showLoading('products-container', 'Loading products...');
        showLoading('cart-container', 'Loading cart...');
        updateStatus('Initializing Wix client...');
        
        // Initialize Wix client
        await initializeWixClient();
        updateStatus('Connected to Wix!');
        
        // Fetch data in parallel, tracking errors
        let productsError: Error | null = null;
        let cartError: Error | null = null;
        
        const [products, cart] = await Promise.all([
            fetchProducts().catch(err => {
                console.error('[Products] Error:', err);
                productsError = err;
                return [] as ProductDisplay[];
            }),
            fetchCurrentCart().catch(err => {
                console.error('[Cart] Error:', err);
                cartError = err;
                return null;
            }),
        ]);
        
        // Render results or errors
        if (productsError) {
            showError('products-container', productsError);
        } else {
            renderProducts(products);
        }
        
        if (cartError) {
            showError('cart-container', cartError);
        } else {
            renderCart(cart);
        }
        
        // Update status based on results
        if (productsError && cartError) {
            updateStatus('Failed to load products and cart', true);
        } else if (productsError) {
            updateStatus('Failed to load products', true);
        } else if (cartError) {
            updateStatus(`Loaded ${products.length} products (cart error)`, true);
        } else {
            updateStatus(`Loaded ${products.length} products`);
        }
        console.log('✅ Application initialized successfully');
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        updateStatus(`Error: ${(error as Error).message}`, true);
    }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}

/**
 * Cart Indicator Component
 *
 * A lightweight cart indicator for site headers showing item count and subtotal.
 * Uses the Wix eCommerce Cart API via client context.
 */

import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps
} from '@jay-framework/fullstack-component';
import { createEffect, Props } from '@jay-framework/component';
import { useGlobalContext } from '@jay-framework/runtime';
import {
    CartIndicatorContract,
    CartIndicatorFastViewState,
    CartIndicatorRefs,
} from '../contracts/cart-indicator.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { WIX_STORES_CONTEXT } from '../contexts/wix-stores-context';
import { CartIndicatorState, mapCartToIndicator } from '../contexts/cart-helpers';

// ============================================================================
// Types
// ============================================================================

interface CartIndicatorSlowCarryForward {
    // No data to carry forward from slow phase
}

interface CartIndicatorFastCarryForward {
    // No data to carry forward from fast phase
}

// ============================================================================
// Rendering Functions
// ============================================================================

/**
 * Fast render phase - show loading state
 */
async function renderFastChanging(
    _props: PageProps,
    _wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<CartIndicatorFastViewState, CartIndicatorFastCarryForward>();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            itemCount: 0,
            hasItems: false,
            subtotal: {
                amount: '0',
                formattedAmount: '$0.00',
                currency: 'USD'
            },
            isLoading: true,
            justAdded: false
        },
        carryForward: {}
    }));
}

/**
 * Interactive phase - load cart data and set up reactivity
 */
function CartIndicatorInteractive(
    _props: Props<PageProps>,
    refs: CartIndicatorRefs,
    viewStateSignals: Signals<CartIndicatorFastViewState>,
    _carryForward: CartIndicatorFastCarryForward
) {
    // Get the stores context for client-side cart operations
    const storesContext = useGlobalContext(WIX_STORES_CONTEXT);

    // Get signal setters from viewStateSignals
    const {
        itemCount: [itemCount, setItemCount],
        hasItems: [hasItems, setHasItems],
        subtotal: [subtotal, setSubtotal],
        isLoading: [isLoading, setIsLoading],
        justAdded: [justAdded, setJustAdded]
    } = viewStateSignals;

    // Load cart data using client context
    async function loadCart() {
        try {
            setIsLoading(true);
            const cart = await storesContext.cart.getCurrentCart();
            const indicator = mapCartToIndicator(cart);
            
            setItemCount(indicator.itemCount);
            setHasItems(indicator.hasItems);
            setSubtotal({
                amount: indicator.subtotal.amount,
                formattedAmount: indicator.subtotal.formattedAmount,
                currency: indicator.subtotal.currency
            });
        } catch (error) {
            console.error('[CartIndicator] Failed to load cart:', error);
        } finally {
            setIsLoading(false);
        }
    }

    // Update cart state (called after add to cart events)
    function updateCart(indicator: CartIndicatorState) {
        setItemCount(indicator.itemCount);
        setHasItems(indicator.hasItems);
        setSubtotal({
            amount: indicator.subtotal.amount,
            formattedAmount: indicator.subtotal.formattedAmount,
            currency: indicator.subtotal.currency
        });
        
        // Trigger "just added" animation
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1500);
    }

    // Listen for cart update events from other components
    createEffect(() => {
        const handleCartUpdate = (event: CustomEvent<CartIndicatorState>) => {
            updateCart(event.detail);
        };

        window.addEventListener('wix-cart-updated' as keyof WindowEventMap, handleCartUpdate as EventListener);
        return () => {
            window.removeEventListener('wix-cart-updated' as keyof WindowEventMap, handleCartUpdate as EventListener);
        };
    });

    // Set up cart link click handlers
    createEffect(() => {
        refs.cartLink?.onclick(() => {
            // Navigation handled by anchor href
        });
    });

    // Load cart on mount
    loadCart();

    return {
        render: () => ({
            itemCount: itemCount(),
            hasItems: hasItems(),
            subtotal: subtotal(),
            isLoading: isLoading(),
            justAdded: justAdded()
        })
    };
}

// ============================================================================
// Component Export
// ============================================================================

/**
 * Cart Indicator Component
 *
 * Displays cart item count and optionally subtotal in site header.
 * Automatically updates when items are added to cart.
 */
export const cartIndicator = makeJayStackComponent<CartIndicatorContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withFastRender(renderFastChanging)
    .withInteractive(CartIndicatorInteractive);

// Re-export types
export type { CartIndicatorState };

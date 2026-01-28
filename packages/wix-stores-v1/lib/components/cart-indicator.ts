/**
 * Cart Indicator Component (V1)
 *
 * A lightweight cart indicator for site headers showing item count.
 * Uses the Wix eCommerce Cart API via client context.
 * 
 * Note: Cart operations are identical between V1 and V3 packages
 * as they both use @wix/ecom.
 */

import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps
} from '@jay-framework/fullstack-component';
import { createEffect, createSignal, Props } from '@jay-framework/component';
import {
    CartIndicatorContract,
    CartIndicatorFastViewState,
    CartIndicatorRefs,
} from '../contracts/cart-indicator.jay-contract';
import { WIX_STORES_V1_SERVICE_MARKER, WixStoresV1Service } from '../services/wix-stores-v1-service.js';
import { WIX_STORES_V1_CONTEXT, WixStoresV1Context } from '../contexts/wix-stores-v1-context';

// ============================================================================
// Types
// ============================================================================

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
    _wixStores: WixStoresV1Service
) {
    const Pipeline = RenderPipeline.for<CartIndicatorFastViewState, CartIndicatorFastCarryForward>();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            itemCount: 0,
            hasItems: false,
            isLoading: true,
            justAdded: false
        },
        carryForward: {}
    }));
}

/**
 * Interactive phase - uses reactive global context signals
 */
function CartIndicatorInteractive(
    _props: Props<PageProps>,
    refs: CartIndicatorRefs,
    viewStateSignals: Signals<CartIndicatorFastViewState>,
    _carryForward: CartIndicatorFastCarryForward,
    storesContext: WixStoresV1Context
) {

    // Get signal setters for loading and animation states
    const {
        isLoading: [isLoading, setIsLoading],
        justAdded: [justAdded, setJustAdded]
    } = viewStateSignals;
    
    // Track previous item count for "just added" animation
    const [prevItemCount, setPrevItemCount] = createSignal(storesContext.cartIndicator.itemCount());

    // Watch for item count changes to trigger animation
    createEffect(() => {
        const currentCount = storesContext.cartIndicator.itemCount();
        if (currentCount > prevItemCount()) {
            // Items were added - trigger animation
            setJustAdded(true);
            setTimeout(() => setJustAdded(false), 1500);
        }
        setPrevItemCount(currentCount);
    });

    refs.cartLink?.onclick(() => {
        // Navigation handled by anchor href
    });

    return {
        render: () => ({
            // Read directly from reactive global context signals
            itemCount: storesContext.cartIndicator.itemCount(),
            hasItems: storesContext.cartIndicator.hasItems(),
            isLoading: isLoading(),
            justAdded: justAdded()
        })
    };
}

// ============================================================================
// Component Export
// ============================================================================

/**
 * Cart Indicator Component (V1)
 *
 * Displays cart item count in site header.
 * Automatically updates when items are added to cart.
 */
export const cartIndicator = makeJayStackComponent<CartIndicatorContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withContexts(WIX_STORES_V1_CONTEXT)
    .withFastRender(renderFastChanging)
    .withInteractive(CartIndicatorInteractive);

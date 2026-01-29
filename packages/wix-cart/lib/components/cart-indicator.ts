/**
 * Cart Indicator Component
 *
 * A lightweight cart indicator for site headers showing item count.
 * Uses the Wix eCommerce Cart API via client context.
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
import { WIX_CART_SERVICE, WixCartService } from '../services/wix-cart-service-marker';
import { WIX_CART_CONTEXT, WixCartContext } from '../contexts/wix-cart-context';

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
    _wixCart: WixCartService
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
    cartContext: WixCartContext
) {

    // Get signal setters for loading and animation states
    const {
        isLoading: [isLoading, setIsLoading],
        justAdded: [justAdded, setJustAdded]
    } = viewStateSignals;
    
    // Track previous item count for "just added" animation
    const [prevItemCount, setPrevItemCount] = createSignal(cartContext.cartIndicator.itemCount());

    // Watch for item count changes to trigger animation
    createEffect(() => {
        const currentCount = cartContext.cartIndicator.itemCount();
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
            itemCount: cartContext.cartIndicator.itemCount(),
            hasItems: cartContext.cartIndicator.hasItems(),
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
 * Displays cart item count in site header.
 * Automatically updates when items are added to cart.
 */
export const cartIndicator = makeJayStackComponent<CartIndicatorContract>()
    .withProps<PageProps>()
    .withServices(WIX_CART_SERVICE)
    .withContexts(WIX_CART_CONTEXT)
    .withFastRender(renderFastChanging)
    .withInteractive(CartIndicatorInteractive);

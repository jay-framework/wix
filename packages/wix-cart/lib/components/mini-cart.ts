/**
 * Mini Cart Drawer Component
 *
 * A container component that auto-opens when a product is added to cart.
 * The template author places cart content (e.g., cart-page) inside.
 */

import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps,
} from '@jay-framework/fullstack-component';
import { createMemo, Props } from '@jay-framework/component';
import {
    MiniCartContract,
    MiniCartFastViewState,
    MiniCartRefs,
} from '../contracts/mini-cart.jay-contract';
import { WIX_CART_SERVICE, WixCartService } from '../services/wix-cart-service-marker';
import { WIX_CART_CONTEXT, WixCartContext } from '../contexts/wix-cart-context';

interface MiniCartFastCarryForward {}

/**
 * Fast render phase — drawer starts closed
 */
async function renderFastChanging(_props: PageProps, _wixCart: WixCartService) {
    const Pipeline = RenderPipeline.for<MiniCartFastViewState, MiniCartFastCarryForward>();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            isOpen: false,
        },
        carryForward: {},
    }));
}

/**
 * Interactive phase — open on add-to-cart, open/close on button clicks
 */
function MiniCartInteractive(
    _props: Props<PageProps>,
    refs: MiniCartRefs,
    viewStateSignals: Signals<MiniCartFastViewState>,
    _carryForward: MiniCartFastCarryForward,
    cartContext: WixCartContext,
) {
    const {
        isOpen: [isOpen, setIsOpen],
    } = viewStateSignals;

    let prevItemCount = cartContext.cartIndicator.itemCount();

    // Open when item count increases
    createMemo(() => {
        const currentCount = cartContext.cartIndicator.itemCount();
        if (currentCount > prevItemCount) {
            setIsOpen(true);
        }
        prevItemCount = currentCount;
    });

    // Open button
    refs.openButton.onclick(() => {
        setIsOpen(true);
    });

    // Close button
    refs.closeButton.onclick(() => {
        setIsOpen(false);
    });

    return {
        render: () => ({
            isOpen: isOpen(),
        }),
    };
}

/**
 * Mini Cart Drawer Component
 *
 * Auto-opens when a product is added to cart.
 * Place cart content (e.g., cart-page component) inside in your template.
 */
export const miniCart = makeJayStackComponent<MiniCartContract>()
    .withProps<PageProps>()
    .withServices(WIX_CART_SERVICE)
    .withContexts(WIX_CART_CONTEXT)
    .withFastRender(renderFastChanging)
    .withInteractive(MiniCartInteractive);

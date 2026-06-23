import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import {
    ProductSpotlightContract,
    ProductSpotlightFastViewState,
    ProductSpotlightInteractiveViewState,
    ProductSpotlightRefs,
} from '../contracts/product-spotlight.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';
import { handleError } from '../utils/wix-error-handler';
import { getProductBySlug } from '../actions/stores-actions.js';
import { ProductCardViewState, QuickAddType } from '../contracts/product-card.jay-contract';

export interface ProductSpotlightProps {
    slug: string;
}

async function renderFastChanging(
    props: PageProps & ProductSpotlightProps,
    _wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<ProductSpotlightFastViewState, Record<string, never>>();

    if (!props.slug) {
        return Pipeline.ok({
            product: {} as ProductCardViewState,
            hasProduct: false,
        }).toPhaseOutput((viewState) => ({
            viewState,
            carryForward: {},
        }));
    }

    return Pipeline.try(async () => {
        return await getProductBySlug({ slug: props.slug });
    })
        .recover((error) => {
            return handleError(error);
        })
        .toPhaseOutput((card) => ({
            viewState: {
                product: card ?? ({} as ProductCardViewState),
                hasProduct: card !== null,
            },
            carryForward: {},
        }));
}

function ProductSpotlightInteractive(
    _props: Props<PageProps & ProductSpotlightProps>,
    refs: ProductSpotlightRefs,
    viewStateSignals: Signals<ProductSpotlightFastViewState>,
    _fastCarryForward: Record<string, never>,
    storesContext: WixStoresContext,
) {
    const {
        product: [product, setProduct],
        hasProduct: [hasProduct],
    } = viewStateSignals;

    refs.product.addToCartButton?.onclick(async () => {
        const p = product();
        if (!p._id || p.quickAddType !== QuickAddType.SIMPLE) return;

        setProduct({ ...p, isAddingToCart: true });
        try {
            await storesContext.addToCart(p._id, 1);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setProduct({ ...product(), isAddingToCart: false });
        }
    });

    refs.product.viewOptionsButton?.onclick(() => {
        const p = product();
        if (p.productUrl) {
            window.location.href = p.productUrl;
        }
    });

    return {
        render: (): ProductSpotlightInteractiveViewState => ({
            product: product(),
            hasProduct: hasProduct(),
        }),
    };
}

export const productSpotlight = makeJayStackComponent<ProductSpotlightContract>()
    .withProps<PageProps & ProductSpotlightProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withContexts(WIX_STORES_CONTEXT)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSpotlightInteractive);

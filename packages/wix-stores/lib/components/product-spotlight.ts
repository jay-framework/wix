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
import { setupCardInteractions } from '../utils/card-interactions.js';
import { handleError } from '../utils/wix-error-handler';
import { getProductBySlug } from '../actions/stores-actions.js';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';

export interface ProductSpotlightProps {
    slug: string;
}

async function renderFastChanging(
    props: PageProps & ProductSpotlightProps,
    _wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<ProductSpotlightFastViewState, Record<string, never>>();

    if (!props.slug) {
        return Pipeline.ok({ product: [], hasProduct: false }).toPhaseOutput((viewState) => ({
            viewState,
            carryForward: {},
        }));
    }

    return Pipeline.try(async () => {
        const card = await getProductBySlug({ slug: props.slug });

        if (!card) {
            return [] as ProductCardViewState[];
        }

        return [card];
    })
        .recover((error) => {
            return handleError(error);
        })
        .toPhaseOutput((product) => ({
            viewState: {
                product,
                hasProduct: product.length > 0,
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

    setupCardInteractions(refs.product, { get: product, set: setProduct }, storesContext);

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

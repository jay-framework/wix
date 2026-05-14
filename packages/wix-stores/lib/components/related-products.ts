import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import {
    RelatedProductsContract,
    RelatedProductsFastViewState,
    RelatedProductsInteractiveViewState,
    RelatedProductsRefs,
    RelatedProductsSlowViewState,
} from '../contracts/related-products.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { searchProducts } from '../actions/stores-actions';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';
import { setupCardInteractions } from '../utils/card-interactions.js';
import { handleError } from '../utils/wix-error-handler';

const DEFAULT_LIMIT = 4;

export interface RelatedProductsProps {
    productId: string;
    categorySlug?: string;
    limit?: number;
}

interface RelatedSlowCarryForward {
    categoryId: string;
    productId: string;
    limit: number;
}

async function renderSlowlyChanging(
    props: PageProps & RelatedProductsProps,
    wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<RelatedProductsSlowViewState, RelatedSlowCarryForward>();
    const limit = props.limit ?? DEFAULT_LIMIT;

    return Pipeline.try(async () => {
        const categorySlug = props.categorySlug;
        if (!categorySlug) {
            return { categoryId: '', categoryName: '' };
        }

        const tree = await wixStores.getCategoryTree();
        let categoryId = '';
        let categoryName = '';
        for (const [id, slug] of tree.slugMap) {
            if (slug === categorySlug) {
                categoryId = id;
                categoryName = slug;
                break;
            }
        }

        // Resolve display name from categories API if we found the ID
        if (categoryId) {
            try {
                const result = await wixStores.categories
                    .queryCategories({ treeReference: { appNamespace: '@wix/stores' } })
                    .eq('_id', categoryId)
                    .limit(1)
                    .find();
                if (result.items?.[0]?.name) {
                    categoryName = result.items[0].name;
                }
            } catch {
                // Fall back to slug as name
            }
        }

        return { categoryId, categoryName };
    })
        .recover((error) => {
            return handleError(error);
        })
        .toPhaseOutput(({ categoryId, categoryName }) => ({
            viewState: {
                categoryName,
            },
            carryForward: {
                categoryId,
                productId: props.productId,
                limit,
            },
        }));
}

async function renderFastChanging(
    _props: PageProps & RelatedProductsProps,
    slowCarryForward: RelatedSlowCarryForward,
    _wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<RelatedProductsFastViewState, Record<string, never>>();
    const { categoryId, productId, limit } = slowCarryForward;

    if (!categoryId) {
        return Pipeline.ok({
            products: [],
            hasProducts: false,
        }).toPhaseOutput((viewState) => ({ viewState, carryForward: {} }));
    }

    return Pipeline.try(async () => {
        const result = await searchProducts({
            query: '',
            filters: { categoryIds: [categoryId] },
            pageSize: limit + 1,
        });

        const products = result.products
            .filter((p) => p._id !== productId)
            .slice(0, limit);

        return {
            products,
            hasProducts: products.length > 0,
        };
    })
        .recover((error) => {
            console.error('Failed to load related products:', error);
            return Pipeline.ok({
                products: [],
                hasProducts: false,
            });
        })
        .toPhaseOutput((viewState) => ({ viewState, carryForward: {} }));
}

function RelatedProductsInteractive(
    _props: Props<PageProps & RelatedProductsProps>,
    refs: RelatedProductsRefs,
    viewStateSignals: Signals<RelatedProductsFastViewState>,
    _fastCarryForward: Record<string, never>,
    storesContext: WixStoresContext,
) {
    const {
        products: [products, setProducts],
        hasProducts: [hasProducts],
    } = viewStateSignals;

    setupCardInteractions(
        refs.products,
        { get: products, set: setProducts },
        storesContext,
    );

    return {
        render: (): RelatedProductsInteractiveViewState => ({
            products: products(),
            hasProducts: hasProducts(),
        }),
    };
}

export const relatedProducts = makeJayStackComponent<RelatedProductsContract>()
    .withProps<PageProps & RelatedProductsProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withContexts(WIX_STORES_CONTEXT)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(RelatedProductsInteractive);

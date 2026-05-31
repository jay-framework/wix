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
import { queryCategories as queryCategoriesApi } from '../wix-apis/index.js';
import { searchProducts } from '../actions/stores-actions';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';
import { setupCardInteractions } from '../utils/card-interactions.js';
import { handleError } from '../utils/wix-error-handler';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';

const DEFAULT_LIMIT = 4;

export interface RelatedProductsProps {
    productId: string;
    categorySlug?: string;
    limit?: number;
}

interface RelatedSlowCarryForward {
    products: ProductCardViewState[];
}

async function renderSlowlyChanging(
    props: PageProps & RelatedProductsProps,
    wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<RelatedProductsSlowViewState, RelatedSlowCarryForward>();
    const limit = props.limit ?? DEFAULT_LIMIT;
    const categorySlug = props.categorySlug;

    if (!categorySlug) {
        return Pipeline.ok({ categoryName: '' }).toPhaseOutput((viewState) => ({
            viewState,
            carryForward: { products: [] },
        }));
    }

    return Pipeline.try(async () => {
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

        if (!categoryId) {
            return { categoryName: '', products: [] as ProductCardViewState[] };
        }

        // Load category name and products in parallel
        const [categoryResult, searchResult] = await Promise.all([
            queryCategoriesApi(wixStores.wixClient, {
                filter: { _id: categoryId },
                paging: { limit: 1 },
            }).catch(() => null),
            searchProducts({
                query: '',
                filters: { categoryIds: [categoryId] },
                pageSize: limit + 1,
            }),
        ]);

        if (categoryResult?.categories?.[0]?.name) {
            categoryName = categoryResult.categories[0].name;
        }

        const products = searchResult.products
            .filter((p) => p._id !== props.productId)
            .slice(0, limit);

        return { categoryName, products };
    })
        .recover((error) => {
            return handleError(error);
        })
        .toPhaseOutput(({ categoryName, products }) => ({
            viewState: { categoryName },
            carryForward: { products },
        }));
}

async function renderFastChanging(
    _props: PageProps & RelatedProductsProps,
    slowCarryForward: RelatedSlowCarryForward,
    _wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<RelatedProductsFastViewState, Record<string, never>>();
    const { products } = slowCarryForward;

    return Pipeline.ok({
        products,
        hasProducts: products.length > 0,
    }).toPhaseOutput((viewState) => ({ viewState, carryForward: {} }));
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

    setupCardInteractions(refs.products, { get: products, set: setProducts }, storesContext);

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

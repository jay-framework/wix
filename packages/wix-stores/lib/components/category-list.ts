import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    UrlParams,
} from '@jay-framework/fullstack-component';
import {
    CategoryListContract,
    CategoryListSlowViewState,
} from '../contracts/category-list.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service';
import { queryCategories as queryCategoriesApi } from '../wix-apis/index.js';

/**
 * URL parameters for category list.
 * Supports optional parentCategory to scope the list to direct children.
 */
export interface CategoryListParams extends UrlParams {
    /** Parent category slug. When set, only direct children of this category are shown. */
    parentCategory?: string;
}

/**
 * Category item for the list view
 */
interface CategoryItem {
    _id: string;
    name: string;
    slug: string;
    description: string;
    productCount: number;
    imageUrl: string;
}

/**
 * Look up a category by slug via the Wix API.
 */
async function findCategoryBySlug(wixClient: WixStoresService['wixClient'], slug: string) {
    const result = await queryCategoriesApi(wixClient, {
        filter: { slug, visible: true },
        paging: { limit: 1 },
    });
    return result.categories?.[0] ?? null;
}

/**
 * Slow Rendering Phase
 * Loads visible categories with their metadata.
 * When parentCategory prop is provided, only direct children of that category are loaded.
 * When not provided, falls back to defaultCategory from config.
 * Categories are relatively static so this is done in slow phase.
 */
async function renderSlowlyChanging(
    props: PageProps & CategoryListParams,
    wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<CategoryListSlowViewState, Record<string, never>>();

    // Resolve parent category: prop → defaultCategory config
    const parentCategorySlug = props.parentCategory ?? wixStores.defaultCategory;

    let parentCategoryId: string | null = null;
    if (parentCategorySlug) {
        const parentCat = await findCategoryBySlug(wixStores.wixClient, parentCategorySlug);
        parentCategoryId = parentCat?._id ?? null;
    }

    return Pipeline.try(async () => {
        const filter: Record<string, unknown> = { visible: true };
        if (parentCategoryId) {
            filter['parentCategory.id'] = parentCategoryId;
        }

        const result = await queryCategoriesApi(wixStores.wixClient, { filter });

        return result.categories || [];
    })
        .recover((error) => {
            console.error('Failed to load categories:', error);
            return Pipeline.ok([]);
        })
        .toPhaseOutput((categories) => {
            const categoryItems: CategoryItem[] = categories.map((cat) => ({
                _id: cat._id || '',
                name: cat.name || '',
                slug: cat.slug || '',
                description: cat.description || '',
                productCount: cat.itemCounter || 0,
                imageUrl: cat.media?.mainMedia?.url || '',
            }));

            return {
                viewState: {
                    categories: categoryItems,
                    hasCategories: categoryItems.length > 0,
                },
                carryForward: {},
            };
        });
}

/**
 * Category List Full-Stack Component
 *
 * A headless component that displays a grid of store categories.
 * Categories are loaded during slow rendering as they rarely change.
 *
 * Usage:
 * ```html
 * <script type="application/jay-headless"
 *         plugin="@jay-framework/wix-stores"
 *         contract="category-list"
 *         key="categoryList"
 * ></script>
 *
 * <div class="categories-grid">
 *   <article forEach="categoryList.categories" trackBy="_id">
 *     <a href="/categories/{slug}" ref="categoryList.categories.categoryLink">
 *       <img src="{imageUrl}" alt="{name}" />
 *       <h2>{name}</h2>
 *       <span>{productCount} products</span>
 *     </a>
 *   </article>
 * </div>
 * ```
 */
export const categoryList = makeJayStackComponent<CategoryListContract>()
    .withProps<PageProps & CategoryListParams>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withSlowlyRender(renderSlowlyChanging);

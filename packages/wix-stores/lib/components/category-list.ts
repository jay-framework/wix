import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline
} from '@jay-framework/fullstack-component';
import {
    CategoryListContract,
    CategoryListSlowViewState
} from '../contracts/category-list.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service';

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
 * Slow Rendering Phase
 * Loads all visible categories with their metadata.
 * Categories are relatively static so this is done in slow phase.
 */
async function renderSlowlyChanging(
    props: PageProps,
    wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<CategoryListSlowViewState, Record<string, never>>();

    return Pipeline
        .try(async () => {
            // Query all visible categories
            const result = await wixStores.categories.queryCategories({
                treeReference: {
                    appNamespace: "@wix/stores"
                }
            })
                .eq('visible', true)
                .find();

            return result.items || [];
        })
        .recover(error => {
            console.error('Failed to load categories:', error);
            return Pipeline.ok([]);
        })
        .toPhaseOutput(categories => {
            const categoryItems: CategoryItem[] = categories.map((cat) => ({
                _id: cat._id || '',
                name: cat.name || '',
                slug: cat.slug || '',
                description: cat.description || '',
                productCount: cat.itemCounter || 0,
                imageUrl: cat.media?.mainMedia?.url || ''
            }));

            return {
                viewState: {
                    categories: categoryItems,
                    hasCategories: categoryItems.length > 0
                },
                carryForward: {}
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
    .withProps<PageProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withSlowlyRender(renderSlowlyChanging);

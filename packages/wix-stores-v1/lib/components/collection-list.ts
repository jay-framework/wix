/**
 * Collection List Component (V1)
 * 
 * A headless component that displays a grid of store collections.
 * V1 uses collections instead of categories (V3).
 * Collections are loaded during slow rendering as they rarely change.
 */

import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline
} from '@jay-framework/fullstack-component';
import {
    CategoryListContract,
    CategoryListSlowViewState
} from '../contracts/category-list.jay-contract';
import { WIX_STORES_V1_SERVICE_MARKER, WixStoresV1Service } from '../services/wix-stores-v1-service';

/**
 * Collection item for the list view
 * (Uses same structure as categories for contract compatibility)
 */
interface CollectionItem {
    _id: string;
    name: string;
    slug: string;
    description: string;
    productCount: number;
    imageUrl: string;
}

/**
 * Slow Rendering Phase
 * Loads all collections with their metadata.
 * Collections are relatively static so this is done in slow phase.
 */
async function renderSlowlyChanging(
    props: PageProps,
    wixStores: WixStoresV1Service
) {
    const Pipeline = RenderPipeline.for<CategoryListSlowViewState, Record<string, never>>();

    return Pipeline
        .try(async () => {
            // Query all collections (V1 API)
            const result = await wixStores.collections.queryCollections().find();
            return result.items || [];
        })
        .recover(error => {
            console.error('[CollectionList V1] Failed to load collections:', error);
            return Pipeline.ok([]);
        })
        .toPhaseOutput(collections => {
            const collectionItems: CollectionItem[] = collections.map((col) => ({
                _id: col._id || '',
                name: col.name || '',
                slug: col.slug || '',
                description: col.description || '',
                productCount: col.numberOfProducts || 0,
                imageUrl: col.media?.mainMedia?.image?.url || ''
            }));

            return {
                viewState: {
                    // Reuse 'categories' field from contract for compatibility
                    categories: collectionItems,
                    hasCategories: collectionItems.length > 0
                },
                carryForward: {}
            };
        });
}

/**
 * Collection List Component (V1)
 * 
 * A headless component that displays a grid of store collections.
 * Uses the same contract as category-list for template compatibility.
 * 
 * Usage:
 * ```html
 * <script type="application/jay-headless"
 *         plugin="@jay-framework/wix-stores-v1"
 *         contract="category-list"
 *         key="collectionList"
 * ></script>
 * 
 * <div class="collections-grid">
 *   <article forEach="collectionList.categories" trackBy="_id">
 *     <a href="/collections/{slug}" ref="collectionList.categories.categoryLink">
 *       <img src="{imageUrl}" alt="{name}" />
 *       <h2>{name}</h2>
 *       <span>{productCount} products</span>
 *     </a>
 *   </article>
 * </div>
 * ```
 */
export const collectionList = makeJayStackComponent<CategoryListContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withSlowlyRender(renderSlowlyChanging);

// Also export as categoryList for drop-in compatibility
export const categoryList = collectionList;

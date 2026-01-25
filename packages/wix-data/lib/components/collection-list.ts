/**
 * Collection List Component
 * 
 * Shared component for collection list pages (index and category).
 * Receives contract via DYNAMIC_CONTRACT_SERVICE to determine which collection to query.
 */

import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    SlowlyRenderResult,
    UrlParams,
    DYNAMIC_CONTRACT_SERVICE,
    DynamicContractMetadata,
} from '@jay-framework/fullstack-component';
import { Props, createSignal } from '@jay-framework/component';
import { WIX_DATA_SERVICE_MARKER, WixDataService } from '../services/wix-data-service';
import { WIX_DATA_CONTEXT, WixDataContext } from '../contexts/wix-data-context';
import { CollectionConfig } from '../config/config-types';

const PAGE_SIZE = 20;

/**
 * URL parameters for list page routes
 * Optional category slug for category pages
 */
export interface ListPageParams extends UrlParams {
    category?: string;
}

/**
 * Slow view state for list pages
 */
interface ListSlowViewState {
    items: Array<{
        _id: string;
        url: string;
        [key: string]: unknown;
    }>;
    totalCount: number;
    category?: {
        _id: string;
        slug: string;
        title: string;
        description: string;
    };
    breadcrumbs: Array<{
        slug: string;
        title: string;
        url: string;
    }>;
}

/**
 * Fast view state for list pages
 */
interface ListFastViewState {
    hasMore: boolean;
    isLoading: boolean;
}

/**
 * Data carried forward from slow to fast rendering
 */
interface ListSlowCarryForward {
    collectionId: string;
    categoryId?: string;
    nextCursor: string | null;
    totalCount: number;
}

/**
 * Data carried forward from fast to interactive
 */
interface ListFastCarryForward {
    collectionId: string;
    categoryId?: string;
    nextCursor: string | null;
}

/**
 * Derive collection ID from contract name
 * "BlogPostsList" -> "BlogPosts"
 */
function deriveCollectionId(contractName: string): string {
    return contractName.replace(/List$/, '');
}

/**
 * Load all list page params for static generation
 * For category pages, also yields category slugs
 */
async function* loadListParams(
    [wixData, contractMeta]: [WixDataService, DynamicContractMetadata]
): AsyncIterable<ListPageParams[]> {
    const collectionId = deriveCollectionId(contractMeta.contractName);
    const config = wixData.getCollectionConfig(collectionId);
    
    if (!config) {
        console.error(`[wix-data] No config found for collection: ${collectionId}`);
        yield [];
        return;
    }
    
    const params: ListPageParams[] = [];
    
    // Index page (no category)
    if (config.components.indexPage) {
        params.push({});
    }
    
    // Category pages
    if (config.components.categoryPage && config.category) {
        try {
            // Query all categories from the category collection
            // The category field is a reference, so we need to get unique values
            const result = await wixData.queryCollection(collectionId)
                .limit(1000)
                .find();
            
            // Extract unique category references
            const categoryIds = new Set<string>();
            for (const item of result.items) {
                const catValue = item.data?.[config.category.referenceField];
                if (Array.isArray(catValue)) {
                    catValue.forEach((id: string) => categoryIds.add(id));
                } else if (typeof catValue === 'string') {
                    categoryIds.add(catValue);
                }
            }
            
            // Fetch category details for slugs
            for (const catId of categoryIds) {
                try {
                    const catResult = await wixData.items.getDataItem(catId);
                    const slug = catResult.dataItem?.data?.[config.category.categorySlugField] as string;
                    if (slug) {
                        params.push({ category: slug });
                    }
                } catch {
                    // Skip categories that can't be fetched
                }
            }
        } catch (error) {
            console.error(`[wix-data] Failed to load category params:`, error);
        }
    }
    
    yield params;
}

/**
 * Slow rendering phase
 * Loads initial items and category data
 */
async function renderSlowlyChanging(
    props: PageProps & ListPageParams,
    wixData: WixDataService,
    contractMeta: DynamicContractMetadata
) {
    const collectionId = deriveCollectionId(contractMeta.contractName);
    
    const Pipeline = RenderPipeline.for<ListSlowViewState, ListSlowCarryForward>();
    
    return Pipeline
        .try(async () => {
            const config = wixData.getCollectionConfig(collectionId);
            
            if (!config) {
                throw new Error(`Collection not configured: ${collectionId}`);
            }
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query: any = wixData.queryCollection(collectionId).limit(PAGE_SIZE);
            let categoryData: ListSlowViewState['category'] | undefined;
            let categoryId: string | undefined;
            
            // If this is a category page, filter by category
            if (props.category && config.category) {
                // Find category by slug
                // This assumes the category is in a separate collection
                // We need to find the category ID first
                const catQuery = wixData.items.queryDataItems({
                    dataCollectionId: config.category.referenceField.split('.')[0] || collectionId
                }).eq(config.category.categorySlugField, props.category);
                
                const catResult = await catQuery.find();
                
                if (catResult.items.length > 0) {
                    const cat = catResult.items[0];
                    categoryId = cat._id;
                    categoryData = {
                        _id: cat._id!,
                        slug: props.category,
                        title: (cat.data?.title as string) || (cat.data?.name as string) || props.category,
                        description: (cat.data?.description as string) || ''
                    };
                    
                    // Filter items by category reference
                    query = query.hasSome(config.category.referenceField, [categoryId]);
                }
            }
            
            const result = await query.find();
            
            // Map items to view state
            const items = result.items.map(item => ({
                _id: item._id!,
                url: `${config.pathPrefix}/${item.data?.[config.slugField] || item._id}`,
                ...item.data
            }));
            
            // Build breadcrumbs
            const breadcrumbs: ListSlowViewState['breadcrumbs'] = [
                { slug: '', title: 'Home', url: '/' },
                { slug: collectionId.toLowerCase(), title: config.collectionId, url: config.pathPrefix }
            ];
            
            if (categoryData) {
                breadcrumbs.push({
                    slug: categoryData.slug,
                    title: categoryData.title,
                    url: `${config.pathPrefix}/category/${categoryData.slug}`
                });
            }
            
            return {
                items,
                totalCount: result.totalCount || items.length,
                category: categoryData,
                breadcrumbs,
                nextCursor: result.cursors?.next || null,
                categoryId
            };
        })
        .recover(error => {
            console.error(`[wix-data] Failed to load list:`, error);
            return Pipeline.clientError(500, 'Failed to load items');
        })
        .toPhaseOutput(data => ({
            viewState: {
                items: data.items,
                totalCount: data.totalCount,
                category: data.category,
                breadcrumbs: data.breadcrumbs
            },
            carryForward: {
                collectionId,
                categoryId: data.categoryId,
                nextCursor: data.nextCursor,
                totalCount: data.totalCount
            }
        }));
}

/**
 * Fast rendering phase
 * Sets up pagination state
 */
async function renderFastChanging(
    props: PageProps & ListPageParams,
    slowCarryForward: ListSlowCarryForward,
    wixData: WixDataService,
    _contractMeta: DynamicContractMetadata
) {
    const Pipeline = RenderPipeline.for<ListFastViewState, ListFastCarryForward>();
    
    return Pipeline.ok({
        hasMore: slowCarryForward.nextCursor !== null,
        isLoading: false
    }).toPhaseOutput(viewState => ({
        viewState,
        carryForward: {
            collectionId: slowCarryForward.collectionId,
            categoryId: slowCarryForward.categoryId,
            nextCursor: slowCarryForward.nextCursor
        }
    }));
}

/**
 * Interactive phase (client-side)
 * Handles load more functionality
 */
function ListInteractive(
    _props: Props<PageProps & ListPageParams>,
    refs: any,
    viewStateSignals: Signals<ListFastViewState>,
    fastCarryForward: ListFastCarryForward,
    wixData: WixDataContext
) {
    const {
        hasMore: [hasMore, setHasMore],
        isLoading: [isLoading, setIsLoading]
    } = viewStateSignals;
    
    let currentCursor = fastCarryForward.nextCursor;
    const [loadedItems, setLoadedItems] = createSignal<any[]>([]);
    
    // Load more button handler
    refs.loadMoreButton?.onclick(async () => {
        if (!currentCursor || isLoading()) return;
        
        setIsLoading(true);
        
        try {
            const result = await wixData.queryItems(fastCarryForward.collectionId, {
                cursor: currentCursor,
                limit: PAGE_SIZE
            });
            
            setLoadedItems([...loadedItems(), ...result.items]);
            setHasMore(result.hasMore);
            currentCursor = result.nextCursor;
            
        } catch (error) {
            console.error('[wix-data] Failed to load more items:', error);
        } finally {
            setIsLoading(false);
        }
    });
    
    return {
        render: () => ({
            hasMore: hasMore(),
            isLoading: isLoading()
        })
    };
}

/**
 * Collection List Full-Stack Component
 * 
 * A shared headless component for list pages (index and category).
 * Used by all collections that have indexPage or categoryPage: true in config.
 */
export const collectionList = makeJayStackComponent<any>()
    .withProps<PageProps>()
    .withServices(WIX_DATA_SERVICE_MARKER, DYNAMIC_CONTRACT_SERVICE)
    .withContexts(WIX_DATA_CONTEXT)
    .withLoadParams(loadListParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ListInteractive);

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
import { CollectionConfig } from '../types';

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
            // Query all items to extract unique category references
            const result = await wixData.items.query(collectionId)
                .limit(1000)
                .find();
            
            // Extract unique category references
            const categoryIds = new Set<string>();
            result.items.forEach(item => {
                const catValue = item.data?.[config.category!.referenceField];
                const catIds = Array.isArray(catValue) ? catValue : 
                               typeof catValue === 'string' ? [catValue] : [];
                catIds.forEach((id: string) => categoryIds.add(id));
            });
            
            // Fetch category details in parallel and filter valid slugs
            const categoryResults = await Promise.all(
                Array.from(categoryIds).map(async (catId) => {
                    try {
                        const catResult = await wixData.items.get('', catId);
                        return catResult.dataItem?.data?.[config.category!.categorySlugField] as string | undefined;
                    } catch {
                        return undefined;
                    }
                })
            );
            
            categoryResults
                .filter((slug): slug is string => !!slug)
                .forEach(slug => params.push({ category: slug }));
                
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
            
            let query: any = wixData.items.query(collectionId).limit(PAGE_SIZE);
            let categoryData: ListSlowViewState['category'] | undefined;
            let categoryId: string | undefined;
            
            // If this is a category page, filter by category
            if (props.category && config.category) {
                // Find category by slug
                // This assumes the category is in a separate collection
                // We need to find the category ID first
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const catQuery = wixData.items.query(config.category.referenceField.split('.')[0] || collectionId)
                    .eq(config.category.categorySlugField, props.category);
                
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
    wixDataContext: WixDataContext
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (wixDataContext.items as any).queryDataItems({
                dataCollectionId: fastCarryForward.collectionId
            })
                .limit(PAGE_SIZE)
                .skipTo(currentCursor)
                .find();
            
            setLoadedItems([...loadedItems(), ...result.items]);
            setHasMore(result.hasNext?.() ?? false);
            currentCursor = result.cursors?.next || null;
            
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

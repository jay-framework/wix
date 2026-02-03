/**
 * Collection List Component
 * 
 * Shared component for collection list pages (index and category).
 * Receives contract info via props (DynamicContractProps) to determine which collection to query.
 */

import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    UrlParams,
    DynamicContractProps,
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import { formatWixMediaUrl, parseWixMediaUrl } from '@jay-framework/wix-utils';
import { WIX_DATA_SERVICE_MARKER, WixDataService } from '../services/wix-data-service';
import { WIX_DATA_CONTEXT, WixDataContext } from '../contexts/wix-data-context';
import { getComponentFields, isComponentEnabled } from '../types';
import { WixDataQuery } from '@wix/wix-data-items-common'
import {WixDataItem} from "@wix/wix-data-items-sdk/build/cjs/src/data-v2-data-item-items.universal";

const PAGE_SIZE = 20;

/**
 * URL parameters for list page routes
 * Optional category slug for category pages
 */
export interface ListPageParams extends UrlParams {
    category?: string;
}

/**
 * Image structure for view state
 */
interface ViewStateImage {
    url: string;
    altText: string;
    width?: number;
    height?: number;
}

/**
 * Item structure for list view state.
 * Contains _id, url, and whitelisted fields with their original names.
 */
interface ListItem {
    _id: string;
    url: string;
    [key: string]: unknown;
}

/**
 * Slow view state for list pages
 */
interface ListSlowViewState {
    items: ListItem[];
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
 * Includes loadedItems for dynamically loaded content (fast+interactive phase)
 */
interface ListFastViewState {
    loadedItems: ListItem[];
    hasMore: boolean;
    isLoading: boolean;
    loadedCount: number;
}

/**
 * Data carried forward from slow to fast rendering
 */
interface ListSlowCarryForward {
    collectionId: string;
    categoryId?: string;
    nextCursor: string | null;
    totalCount: number;
    pathPrefix: string;
    slugField: string;
    /** Field whitelist - undefined means all fields */
    fieldWhitelist?: string[];
}

/**
 * Data carried forward from fast to interactive
 */
interface ListFastCarryForward {
    collectionId: string;
    categoryId?: string;
    nextCursor: string | null;
    pathPrefix: string;
    slugField: string;
    /** Field whitelist - undefined means all fields */
    fieldWhitelist?: string[];
}

/**
 * Metadata from dynamic contract generator
 */
interface WixDataMetadata {
    collectionId: string;
}

/**
 * Load all list page params for static generation
 * For category pages, also yields category slugs
 * Contract info is passed as last argument by the runtime
 */
async function* loadListParams(
    services: [WixDataService, ...any[]]
): AsyncIterable<ListPageParams[]> {
    const [wixData, contractInfo] = services as [WixDataService, DynamicContractProps<WixDataMetadata>?];
    if (!contractInfo?.metadata) {
        console.warn('[wix-data] loadListParams called without contract metadata');
        yield [];
        return;
    }
    const { collectionId } = contractInfo.metadata;
    const config = wixData.getCollectionConfig(collectionId);
    
    if (!config) {
        console.error(`[wix-data] No config found for collection: ${collectionId}`);
        yield [];
        return;
    }
    
    const params: ListPageParams[] = [];
    
    // Index page (no category)
    if (isComponentEnabled(config.components.indexPage)) {
        params.push({});
    }
    
    // Category pages
    if (isComponentEnabled(config.components.categoryPage) && config.category) {
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
    props: PageProps & ListPageParams & DynamicContractProps<WixDataMetadata>,
    wixData: WixDataService
) {
    const { collectionId } = props.metadata!;
    
    const Pipeline = RenderPipeline.for<ListSlowViewState, ListSlowCarryForward>();
    
    return Pipeline
        .try(async () => {
            const config = wixData.getCollectionConfig(collectionId);
            
            if (!config) {
                throw new Error(`Collection not configured: ${collectionId}`);
            }
            
            // Get field whitelist from component config (indexPage or categoryPage)
            const componentConfig = config.components.indexPage || config.components.categoryPage;
            const fieldWhitelist = getComponentFields(componentConfig);
            
            let query: WixDataQuery = wixData.items.query(collectionId).limit(PAGE_SIZE);
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

            // Map items to view state using field whitelist
            const items = result.items.map((item: WixDataItem) =>
                mapItemToViewState(item, config.pathPrefix, config.slugField, fieldWhitelist)
            );
            
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
                categoryId,
                pathPrefix: config.pathPrefix,
                slugField: config.slugField,
                fieldWhitelist
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
                totalCount: data.totalCount,
                pathPrefix: data.pathPrefix,
                slugField: data.slugField,
                fieldWhitelist: data.fieldWhitelist
            }
        }));
}

/**
 * Fast rendering phase
 * Sets up load more state. Items already loaded in slow phase.
 */
async function renderFastChanging(
    props: PageProps & ListPageParams & DynamicContractProps<WixDataMetadata>,
    slowCarryForward: ListSlowCarryForward,
    wixData: WixDataService
) {
    const Pipeline = RenderPipeline.for<ListFastViewState, ListFastCarryForward>();
    
    return Pipeline.ok({
        loadedItems: [],  // Empty initially - items loaded via "load more"
        hasMore: slowCarryForward.nextCursor !== null,
        isLoading: false,
        loadedCount: 0
    }).toPhaseOutput(viewState => ({
        viewState,
        carryForward: {
            collectionId: slowCarryForward.collectionId,
            categoryId: slowCarryForward.categoryId,
            nextCursor: slowCarryForward.nextCursor,
            pathPrefix: slowCarryForward.pathPrefix,
            slugField: slowCarryForward.slugField,
            fieldWhitelist: slowCarryForward.fieldWhitelist
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
        loadedItems: [loadedItems, setLoadedItems],
        hasMore: [hasMore, setHasMore],
        isLoading: [isLoading, setIsLoading],
        loadedCount: [loadedCount, setLoadedCount]
    } = viewStateSignals;
    
    let currentCursor = fastCarryForward.nextCursor;
    const { pathPrefix, slugField, fieldWhitelist } = fastCarryForward;
    
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
            
            // Map new items using field whitelist
            const newItems: ListItem[] = result.items.map((item: any) => 
                mapItemToViewState(item, pathPrefix, slugField, fieldWhitelist)
            );
            
            setLoadedItems([...loadedItems(), ...newItems]);
            setLoadedCount(loadedCount() + newItems.length);
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
            loadedItems: loadedItems(),
            hasMore: hasMore(),
            isLoading: isLoading(),
            loadedCount: loadedCount()
        })
    };
}

// ============================================================================
// Item Mapping Helpers
// ============================================================================

/**
 * Check if a value looks like a Wix image
 */
function isImageValue(value: unknown): boolean {
    if (typeof value === 'string' && value.startsWith('wix:image://')) return true;
    if (typeof value === 'object' && value !== null && ('src' in value || 'url' in value)) return true;
    return false;
}

/**
 * Transform a Wix image field value to view state format.
 * Handles wix:image:// protocol URLs and extracts dimensions.
 */
function mapImageField(imgValue: unknown, altText?: string): ViewStateImage | undefined {
    if (!imgValue) return undefined;
    
    // Handle string URL (wix:image:// or http(s)://)
    if (typeof imgValue === 'string') {
        const parsed = parseWixMediaUrl(imgValue);
        return {
            url: formatWixMediaUrl('', imgValue),
            altText: altText || '',
            width: parsed?.originWidth,
            height: parsed?.originHeight
        };
    }
    
    // Handle object with src/url property
    if (typeof imgValue === 'object' && imgValue !== null) {
        const img = imgValue as Record<string, unknown>;
        const srcUrl = ((img.src || img.url) as string) || '';
        const parsed = parseWixMediaUrl(srcUrl);
        
        return {
            url: formatWixMediaUrl('', srcUrl),
            altText: (img.alt as string) || altText || '',
            width: parsed?.originWidth ?? (img.width as number),
            height: parsed?.originHeight ?? (img.height as number)
        };
    }
    
    return undefined;
}

/**
 * Map a Wix Data item to the view state structure.
 * Uses field whitelist to include only specified fields, or all non-system fields if no whitelist.
 * Image fields are transformed to public URLs.
 */
function mapItemToViewState(
    item: { _id?: string; data?: Record<string, unknown> },
    pathPrefix: string,
    slugField: string,
    whitelist?: string[]
): ListItem {
    const data = item.data || {};
    
    const mapped: ListItem = {
        _id: item._id!,
        url: `${pathPrefix}/${data[slugField] || item._id}`
    };
    
    // Determine which keys to include
    const keysToInclude = whitelist 
        || Object.keys(data).filter(k => !k.startsWith('_'));
    
    // Get title for image alt text fallback (look for 'title' or 'name' field)
    const titleValue = data.title || data.name;
    const altText = typeof titleValue === 'string' ? titleValue : '';
    
    // Map each field
    keysToInclude.forEach(key => {
        const value = data[key];
        if (value == null) return;
        
        // Transform image fields
        if (isImageValue(value)) {
            mapped[key] = mapImageField(value, altText);
        } else {
            mapped[key] = value;
        }
    });
    
    return mapped;
}

/**
 * Collection List Full-Stack Component
 * 
 * A shared headless component for list pages (index and category).
 * Used by all collections that have indexPage or categoryPage: true in config.
 */
export const collectionList = makeJayStackComponent<any>()
    .withProps<PageProps & DynamicContractProps<WixDataMetadata>>()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .withContexts(WIX_DATA_CONTEXT)
    .withLoadParams(loadListParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ListInteractive);

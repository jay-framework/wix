/**
 * Collection Item Component
 * 
 * Shared component for all collection item pages.
 * Receives contract via DYNAMIC_CONTRACT_SERVICE to determine which collection to query.
 */

import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    SlowlyRenderResult,
    UrlParams,
    DYNAMIC_CONTRACT_SERVICE,
    DynamicContractMetadata,
} from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER, WixDataService } from '../services/wix-data-service';
import { CollectionConfig } from '../types';

/**
 * URL parameters for item page routes
 * Supports dynamic routing like /blog/[slug]
 */
export interface ItemPageParams extends UrlParams {
    slug: string;
}

/**
 * Data carried forward from slow to fast rendering
 */
interface ItemSlowCarryForward {
    itemId: string;
    collectionId: string;
}

/**
 * Derive collection ID from contract name
 * "BlogPostsItem" -> "BlogPosts"
 */
function deriveCollectionId(contractName: string): string {
    return contractName.replace(/Item$/, '');
}

/**
 * Load all item slugs for static site generation
 */
async function* loadItemParams(
    [wixData, contractMeta]: [WixDataService, DynamicContractMetadata]
): AsyncIterable<ItemPageParams[]> {
    const collectionId = deriveCollectionId(contractMeta.contractName);
    const config = wixData.getCollectionConfig(collectionId);
    
    if (!config) {
        console.error(`[wix-data] No config found for collection: ${collectionId}`);
        yield [];
        return;
    }
    
    try {
        const result = await wixData.items.query(collectionId)
            .find();
        
        yield result.items.map(item => ({
            slug: (item[config.slugField] as string) || item._id
        }));
        
    } catch (error) {
        console.error(`[wix-data] Failed to load slugs for ${collectionId}:`, error);
        yield [];
    }
}

/**
 * Slow rendering phase
 * Loads the item data from Wix Data
 */
async function renderSlowlyChanging(
    props: PageProps & ItemPageParams,
    wixData: WixDataService,
    contractMeta: DynamicContractMetadata
) {
    const collectionId = deriveCollectionId(contractMeta.contractName);
    
    const Pipeline = RenderPipeline.for<any, ItemSlowCarryForward>();
    
    return Pipeline
        .try(async () => {
            const config = wixData.getCollectionConfig(collectionId);
            
            if (!config) {
                throw new Error(`Collection not configured: ${collectionId}`);
            }
            
            // Query item by slug
            const result = await wixData.items.query(collectionId)
                .eq(config.slugField, props.slug)
                .find();
            
            if (!result.items.length) {
                throw new Error('Item not found');
            }
            
            const item = result.items[0];
            
            // Build view state from item data
            const viewState = await mapItemToViewState(item, config, wixData);
            
            return { item, viewState, collectionId };
        })
        .recover(error => {
            console.error(`[wix-data] Item not found: ${props.slug}`, error);
            return Pipeline.clientError(404, 'Item not found');
        })
        .toPhaseOutput(({ item, viewState, collectionId: colId }) => ({
            viewState,
            carryForward: {
                itemId: item._id!,
                collectionId: colId
            }
        }));
}

/**
 * Map Wix Data item to view state
 * Handles embedded references
 */
async function mapItemToViewState(
    item: { _id?: string; data?: Record<string, unknown> },
    config: CollectionConfig,
    wixData: WixDataService
): Promise<Record<string, unknown>> {
    const data = item.data || {};
    
    // Filter out internal fields (except _id)
    const processableEntries = Object.entries(data)
        .filter(([key]) => !key.startsWith('_') || key === '_id');
    
    // Process fields in parallel for embedded references
    const mappedEntries = await Promise.all(
        processableEntries.map(async ([key, value]): Promise<[string, unknown]> => {
            const refConfig = config.references?.find(r => r.fieldName === key);
            
            if (refConfig?.mode === 'embed' && value) {
                return [key, await fetchReference(value, wixData)];
            } else if (isImageValue(value)) {
                return [key, mapImageValue(value)];
            } else {
                return [key, value];
            }
        })
    );
    
    return {
        _id: item._id,
        ...Object.fromEntries(mappedEntries)
    };
}

/**
 * Check if a value looks like a Wix image
 */
function isImageValue(value: unknown): value is { src?: string; url?: string } {
    return typeof value === 'object' && value !== null && ('src' in value || 'url' in value);
}

/**
 * Map Wix image value to view state format
 */
function mapImageValue(value: { src?: string; url?: string; alt?: string; width?: number; height?: number }): {
    url: string;
    altText: string;
    width?: number;
    height?: number;
} {
    return {
        url: value.src || value.url || '',
        altText: value.alt || '',
        width: value.width,
        height: value.height
    };
}

/**
 * Fetch referenced item(s)
 */
async function fetchReference(
    refValue: unknown,
    wixData: WixDataService
): Promise<unknown> {
    try {
        if (Array.isArray(refValue)) {
            // Multi-reference: fetch all items
            const items = await Promise.all(
                refValue.map(async (id: string) => {
                    try {
                        const result = await wixData.items.get('', id);
                        return result.dataItem ? {
                            _id: result.dataItem._id,
                            ...result.dataItem.data
                        } : null;
                    } catch {
                        return null;
                    }
                })
            );
            return items.filter(Boolean);
        } else if (typeof refValue === 'string') {
            // Single reference: fetch one item
            const result = await wixData.items.get('', refValue);
            return result.dataItem ? {
                _id: result.dataItem._id,
                ...result.dataItem.data
            } : null;
        }
    } catch (error) {
        console.error('[wix-data] Failed to fetch reference:', error);
    }
    return null;
}

/**
 * Collection Item Full-Stack Component
 * 
 * A shared headless component for item pages.
 * Used by all collections that have itemPage: true in config.
 * 
 * The component receives contract metadata via DYNAMIC_CONTRACT_SERVICE
 * to determine which collection to query.
 */
export const collectionItem = makeJayStackComponent<any>()
    .withProps<PageProps>()
    .withServices(WIX_DATA_SERVICE_MARKER, DYNAMIC_CONTRACT_SERVICE)
    .withLoadParams(loadItemParams)
    .withSlowlyRender(renderSlowlyChanging);

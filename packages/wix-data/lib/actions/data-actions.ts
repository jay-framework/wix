/**
 * Server Actions for Wix Data
 *
 * Provides RPC-style actions for client-side code to interact with
 * Wix Data collections.
 */

import { makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER, WixDataService } from '../services/wix-data-service';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for queryItems action
 */
export interface QueryItemsInput {
    /** Collection ID to query */
    collectionId: string;
    
    /** Maximum number of items to return */
    limit?: number;
    
    /** Cursor for pagination */
    cursor?: string;
    
    /** Field to sort by */
    sortField?: string;
    
    /** Sort direction */
    sortDirection?: 'ASC' | 'DESC';
    
    /** Filter conditions (field -> value) */
    filter?: Record<string, unknown>;
}

/**
 * Output for queryItems action
 */
export interface QueryItemsOutput {
    /** List of items */
    items: Array<{
        _id: string;
        data: Record<string, unknown>;
    }>;
    
    /** Total number of items matching query */
    totalCount: number;
    
    /** Cursor for next page (null if no more results) */
    nextCursor: string | null;
    
    /** Whether there are more results */
    hasMore: boolean;
}

/**
 * Input for getItemBySlug action
 */
export interface GetItemBySlugInput {
    /** Collection ID */
    collectionId: string;
    
    /** Item slug value */
    slug: string;
}

/**
 * Output for getItemBySlug action
 */
export interface GetItemBySlugOutput {
    /** Item data, or null if not found */
    item: {
        _id: string;
        data: Record<string, unknown>;
    } | null;
}

/**
 * Input for getCategories action
 */
export interface GetCategoriesInput {
    /** Collection ID that has category references */
    collectionId: string;
}

/**
 * Category item
 */
export interface CategoryItem {
    _id: string;
    slug: string;
    title: string;
    itemCount: number;
}

/**
 * Output for getCategories action
 */
export interface GetCategoriesOutput {
    /** List of categories */
    categories: CategoryItem[];
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Query items from a collection.
 * 
 * Supports pagination, sorting, and filtering.
 * 
 * @example
 * ```typescript
 * const results = await queryItems({
 *     collectionId: 'BlogPosts',
 *     limit: 20,
 *     sortField: 'publishDate',
 *     sortDirection: 'DESC',
 *     filter: { status: 'published' }
 * });
 * ```
 */
export const queryItems = makeJayQuery('wixData.queryItems')
    .withServices(WIX_DATA_SERVICE_MARKER)
    .withHandler(async (
        input: QueryItemsInput,
        wixData: WixDataService
    ): Promise<QueryItemsOutput> => {
        const {
            collectionId,
            limit = 20,
            cursor,
            sortField,
            sortDirection = 'ASC',
            filter = {}
        } = input;
        
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query: any = wixData.items.query(collectionId).limit(limit);
            
            // Apply cursor pagination
            if (cursor) {
                query = query.skipTo(cursor);
            }
            
            // Apply sorting
            if (sortField) {
                query = sortDirection === 'DESC' 
                    ? query.descending(sortField)
                    : query.ascending(sortField);
            }
            
            // Apply filters
            query = Object.entries(filter)
                .filter(([, value]) => value !== undefined && value !== null)
                .reduce((q: any, [field, value]) => q.eq(field, value), query);
            
            const result = await query.find();
            
            return {
                items: result.items.map((item: any) => ({
                    _id: item._id!,
                    data: item.data || {}
                })),
                totalCount: result.totalCount || result.items.length,
                nextCursor: result.cursors?.next || null,
                hasMore: result.hasNext()
            };
            
        } catch (error) {
            console.error('[wixData.queryItems] Query failed:', error);
            throw new ActionError('QUERY_FAILED', 'Failed to query items');
        }
    });

/**
 * Get a single item by its slug.
 * 
 * Uses the slugField configured for the collection.
 * 
 * @example
 * ```typescript
 * const result = await getItemBySlug({
 *     collectionId: 'BlogPosts',
 *     slug: 'my-first-post'
 * });
 * ```
 */
export const getItemBySlug = makeJayQuery('wixData.getItemBySlug')
    .withServices(WIX_DATA_SERVICE_MARKER)
    .withCaching({ maxAge: 300, staleWhileRevalidate: 600 })
    .withHandler(async (
        input: GetItemBySlugInput,
        wixData: WixDataService
    ): Promise<GetItemBySlugOutput> => {
        const { collectionId, slug } = input;
        
        if (!slug) {
            throw new ActionError('INVALID_INPUT', 'Slug is required');
        }
        
        const config = wixData.getCollectionConfig(collectionId);
        if (!config) {
            throw new ActionError('INVALID_CONFIG', `Collection not configured: ${collectionId}`);
        }
        
        try {
            const result = await wixData.items.query(collectionId)
                .eq(config.slugField, slug)
                .find();
            
            if (!result.items.length) {
                return { item: null };
            }
            
            const item = result.items[0];
            return {
                item: {
                    _id: item._id!,
                    data: item.data || {}
                }
            };
            
        } catch (error) {
            console.error('[wixData.getItemBySlug] Failed to get item:', error);
            return { item: null };
        }
    });

/**
 * Get categories for a collection.
 * 
 * Returns distinct category values from the configured category reference field.
 * 
 * @example
 * ```typescript
 * const result = await getCategories({
 *     collectionId: 'BlogPosts'
 * });
 * // Returns: { categories: [{ _id: '...', slug: 'tech', title: 'Technology', itemCount: 15 }, ...] }
 * ```
 */
export const getCategories = makeJayQuery('wixData.getCategories')
    .withServices(WIX_DATA_SERVICE_MARKER)
    .withCaching({ maxAge: 3600 })
    .withHandler(async (
        input: GetCategoriesInput,
        wixData: WixDataService
    ): Promise<GetCategoriesOutput> => {
        const { collectionId } = input;
        
        const config = wixData.getCollectionConfig(collectionId);
        if (!config) {
            throw new ActionError('INVALID_CONFIG', `Collection not configured: ${collectionId}`);
        }
        
        if (!config.category) {
            return { categories: [] };
        }
        
        try {
            // Fetch all items to count by category
            // TODO: This could be optimized with aggregation if available
            const result = await wixData.items.query(collectionId)
                .limit(1000)
                .find();
            
            // Count items per category
            const categoryCounts = new Map<string, number>();
            const categoryIds = new Set<string>();
            
            result.items.forEach(item => {
                const catValue = item.data?.[config.category.referenceField];
                const catIds = Array.isArray(catValue) ? catValue : 
                               typeof catValue === 'string' ? [catValue] : [];
                
                catIds.forEach((catId: string) => {
                    categoryIds.add(catId);
                    categoryCounts.set(catId, (categoryCounts.get(catId) || 0) + 1);
                });
            });
            
            // Fetch category details in parallel
            const categoryResults = await Promise.all(
                Array.from(categoryIds).map(async (catId): Promise<CategoryItem | null> => {
                    try {
                        const catResult = await wixData.items.get('', catId);
                        const catData = catResult.dataItem?.data;
                        
                        if (!catData) return null;
                        
                        return {
                            _id: catId,
                            slug: (catData[config.category.categorySlugField] as string) || catId,
                            title: (catData.title as string) || (catData.name as string) || catId,
                            itemCount: categoryCounts.get(catId) || 0
                        };
                    } catch {
                        return null;
                    }
                })
            );
            
            const categories = categoryResults.filter((c): c is CategoryItem => c !== null);
            
            // Sort by item count descending
            categories.sort((a, b) => b.itemCount - a.itemCount);
            
            return { categories };
            
        } catch (error) {
            console.error('[wixData.getCategories] Failed to load categories:', error);
            throw new ActionError('LOAD_FAILED', 'Failed to load categories');
        }
    });

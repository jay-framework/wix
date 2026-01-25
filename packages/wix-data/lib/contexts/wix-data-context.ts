/**
 * Client-side Wix Data Context
 * 
 * Provides client-side access to Wix Data for interactive features
 * like load more, filtering, etc.
 */

import { createJayContext, useGlobalContext } from '@jay-framework/runtime';
import { registerReactiveGlobalContext, useReactive } from '@jay-framework/component';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { items } from '@wix/data';

/**
 * Data passed from server to client during initialization
 */
export interface WixDataInitData {
    /** Collection IDs that are configured */
    collections: string[];
}

/**
 * Client-side Wix Data context interface
 */
export interface WixDataContext {
    /**
     * Query items from a collection
     */
    queryItems(
        collectionId: string,
        options?: {
            limit?: number;
            cursor?: string;
            filter?: Record<string, unknown>;
        }
    ): Promise<{
        items: Array<{ _id: string; data: Record<string, unknown> }>;
        nextCursor: string | null;
        hasMore: boolean;
    }>;
    
    /**
     * Get a single item by ID
     */
    getItem(
        collectionId: string,
        itemId: string
    ): Promise<{ _id: string; data: Record<string, unknown> } | null>;
}

/**
 * Client context marker for Wix Data
 */
export const WIX_DATA_CONTEXT = createJayContext<WixDataContext>();

/**
 * Create and register the client-side Wix Data context
 */
export function provideWixDataContext(): WixDataContext {
    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client;
    
    // Get items client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsClient: any = wixClient.use(items);
    
    const context = registerReactiveGlobalContext(WIX_DATA_CONTEXT, () => {
        const reactive = useReactive();
        
        async function queryItems(
            collectionId: string,
            options: {
                limit?: number;
                cursor?: string;
                filter?: Record<string, unknown>;
            } = {}
        ) {
            const { limit = 20, cursor, filter } = options;
            
            let query = itemsClient.queryDataItems({
                dataCollectionId: collectionId
            }).limit(limit);
            
            // Apply cursor if provided
            if (cursor) {
                query = query.skipTo(cursor);
            }
            
            // Apply filters if provided
            if (filter) {
                for (const [key, value] of Object.entries(filter)) {
                    query = query.eq(key, value);
                }
            }
            
            const result = await query.find();
            
            return {
                items: result.items.map((item: { _id?: string; data?: Record<string, unknown> }) => ({
                    _id: item._id || '',
                    data: item.data || {}
                })),
                nextCursor: result.cursors?.next || null,
                hasMore: result.hasNext?.() ?? false
            };
        }
        
        async function getItem(collectionId: string, itemId: string) {
            try {
                const result = await itemsClient.getDataItem(itemId, {
                    dataCollectionId: collectionId
                });
                
                if (!result.dataItem) return null;
                
                return {
                    _id: result.dataItem._id || '',
                    data: result.dataItem.data || {}
                };
            } catch {
                return null;
            }
        }
        
        return {
            queryItems,
            getItem
        };
    });
    
    console.log('[wix-data] Client data context initialized');
    return context;
}

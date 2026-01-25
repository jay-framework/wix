/**
 * Client-side Wix Data Context
 * 
 * Provides client-side access to Wix Data APIs.
 */

import { createJayContext, useGlobalContext } from '@jay-framework/runtime';
import { registerReactiveGlobalContext } from '@jay-framework/component';
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
 * Exposes the Wix Data items API directly
 */
export interface WixDataContext {
    /** Wix Data Items API client */
    items: typeof items;
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
    
    const itemsClient: typeof items = wixClient.use(items) as unknown as typeof items;
    
    const context = registerReactiveGlobalContext(WIX_DATA_CONTEXT, () => ({
        items: itemsClient
    }));
    
    console.log('[wix-data] Client data context initialized');
    return context;
}

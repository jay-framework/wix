/**
 * Server-side Wix Stores Service
 *
 * Provides access to Wix Stores APIs on the server using API Key authentication.
 * Used with .withServices(WIX_STORES_SERVICE_MARKER) in component definitions.
 */

import { WixClient } from '@wix/sdk';
import {
    getCategoriesClient,
    getInventoryClient,
    getProductsV3Client,
} from '../utils/wix-store-api';
import { getCurrentCartClient } from '@jay-framework/wix-cart';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { type UrlTemplates } from '../config-loader';
import { type CategoryTree } from '../utils/product-mapper';
import {BuildDescriptors} from "@wix/sdk-types";
import {productsV3} from "@wix/stores";
import {categories} from "@wix/categories";
import {inventoryItemsV3} from "@wix/stores";
import {currentCart} from "@wix/ecom";

export interface WixStoresService {
    products: BuildDescriptors<typeof productsV3, {}>;
    categories: BuildDescriptors<typeof categories, {}>;
    inventory: BuildDescriptors<typeof inventoryItemsV3, {}>;
    /** @deprecated Use WIX_CART_SERVICE from @jay-framework/wix-cart instead */
    cart: BuildDescriptors<typeof currentCart, {}>;
    /** URL templates for building canonical links */
    urls: UrlTemplates;
    /** Slug of the fallback category for pages without category context */
    defaultCategory: string | null;
    /** Get the cached category tree. Lazily built on first call. */
    getCategoryTree(): Promise<CategoryTree>;
}

/**
 * Server service marker for Wix Stores.
 */
export const WIX_STORES_SERVICE_MARKER = createJayService<WixStoresService>('Wix Store Service');

/**
 * Options for initializing the Wix Stores service.
 */
export interface WixStoresServiceOptions {
    urls?: UrlTemplates;
    defaultCategory?: string | null;
}

/**
 * Creates, registers, and returns a Wix Stores service instance.
 */
export function provideWixStoresService(
    wixClient: WixClient,
    options?: WixStoresServiceOptions,
): WixStoresService {
    let cachedTree: CategoryTree | null = null;

    const categoriesClient = getCategoriesClient(wixClient);

    const service: WixStoresService = {
        products: getProductsV3Client(wixClient),
        categories: categoriesClient,
        inventory: getInventoryClient(wixClient),
        cart: getCurrentCartClient(wixClient),
        urls: options?.urls ?? { product: '/products/{slug}', category: null },
        defaultCategory: options?.defaultCategory ?? null,

        async getCategoryTree(): Promise<CategoryTree> {
            if (cachedTree) return cachedTree;

            const slugMap = new Map<string, string>();
            const parentMap = new Map<string, string>();
            const rootIds = new Set<string>();
            const imageMap = new Map<string, string>();

            try {
                const processItems = (items: Array<{ _id?: string; slug?: string; parentCategory?: { _id?: string }; media?: { mainMedia?: { image?: { url?: string }; url?: string } } }>) => {
                    for (const cat of items) {
                        if (!cat._id || !cat.slug) continue;
                        slugMap.set(cat._id, cat.slug);
                        if (cat.parentCategory?._id) {
                            parentMap.set(cat._id, cat.parentCategory._id);
                        } else {
                            rootIds.add(cat._id);
                        }
                        const imageUrl = cat.media?.mainMedia?.image?.url || cat.media?.mainMedia?.url;
                        if (imageUrl) {
                            imageMap.set(cat._id, imageUrl);
                        }
                    }
                };

                let result = await categoriesClient
                    .queryCategories({ treeReference: { appNamespace: '@wix/stores' } })
                    .eq('visible', true)
                    .limit(100)
                    .find();

                processItems(result.items || []);
                while (result.hasNext()) {
                    result = await result.next();
                    processItems(result.items || []);
                }
            } catch (error) {
                console.error('[wix-stores] Failed to build category tree:', error);
            }

            cachedTree = { slugMap, parentMap, rootIds, imageMap };
            return cachedTree;
        },
    };

    registerService(WIX_STORES_SERVICE_MARKER, service);
    return service;
}

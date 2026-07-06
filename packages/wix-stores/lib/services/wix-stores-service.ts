/**
 * Server-side Wix Stores Service
 *
 * Provides the WixClient and URL templates for Wix Stores operations.
 * API calls use functions from wix-apis/ with the client from this service.
 */

import { type WixClient } from '@wix/sdk';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { type UrlTemplates } from '../config-loader.js';
import { type CategoryTree } from '../utils/product-mapper.js';
import { queryCategories } from '../wix-apis/query-categories.js';
import { queryCustomizations } from '../wix-apis/query-customizations.js';
import { querySchemas } from '../wix-apis/query-schemas.js';
import type { DataExtensionSchema } from '../utils/data-extension-schema.js';
import type { Customization } from '../wix-apis/types.js';

export interface WixStoresService {
    /** The authenticated Wix client (server-side, API key auth) */
    wixClient: WixClient;
    /** URL templates for building canonical links */
    urls: UrlTemplates;
    /** Slug of the fallback category for pages without category context */
    defaultCategory: string | null;
    /** Get the cached category tree. Lazily built on first call. */
    getCategoryTree(): Promise<CategoryTree>;
    /** Get cached product customizations (options with choices). Lazily loaded. */
    getCustomizations(): Promise<Customization[]>;
    /** Get cached data extension schemas for products. Lazily loaded. */
    getDataExtensionSchemas(): Promise<DataExtensionSchema[]>;
    /** Get the "All Products" system category ID. Lazily fetched and cached. */
    getAllProductsCategoryId(): Promise<string | null>;
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
    let cachedCustomizations: Customization[] | null = null;
    let cachedExtensionSchemas: DataExtensionSchema[] | null = null;
    let cachedAllProductsCategoryId: string | null | undefined;

    const service: WixStoresService = {
        wixClient,
        urls: options?.urls ?? { product: '/products/{slug}', category: null },
        defaultCategory: options?.defaultCategory ?? null,

        async getCategoryTree(): Promise<CategoryTree> {
            if (cachedTree) return cachedTree;

            const slugMap = new Map<string, string>();
            const parentMap = new Map<string, string>();
            const rootIds = new Set<string>();
            const imageMap = new Map<string, string>();

            try {
                const processItems = (
                    items: Array<{
                        _id?: string;
                        slug?: string;
                        parentCategory?: { _id?: string };
                        media?: { mainMedia?: { image?: { url?: string }; url?: string } };
                    }>,
                ) => {
                    for (const cat of items) {
                        if (!cat._id || !cat.slug) continue;
                        slugMap.set(cat._id, cat.slug);
                        if (cat.parentCategory?._id) {
                            parentMap.set(cat._id, cat.parentCategory._id);
                        } else {
                            rootIds.add(cat._id);
                        }
                        const imageUrl =
                            cat.media?.mainMedia?.image?.url || cat.media?.mainMedia?.url;
                        if (imageUrl) {
                            imageMap.set(cat._id, imageUrl);
                        }
                    }
                };

                let offset = 0;
                let hasMore = true;
                while (hasMore) {
                    const result = await queryCategories(wixClient, {
                        filter: { visible: true },
                        paging: { limit: 100, offset },
                    });
                    processItems(result.categories || []);
                    hasMore = (result.categories?.length || 0) === 100;
                    offset += 100;
                }
            } catch (error) {
                console.error('[wix-stores] Failed to build category tree:', error);
            }

            cachedTree = { slugMap, parentMap, rootIds, imageMap };
            return cachedTree;
        },

        async getCustomizations(): Promise<Customization[]> {
            if (cachedCustomizations) return cachedCustomizations;

            try {
                const result = await queryCustomizations(wixClient, {
                    filter: { customizationType: 'PRODUCT_OPTION' },
                    paging: { limit: 100 },
                });
                cachedCustomizations = result.customizations || [];
            } catch (error) {
                console.error('[wix-stores] Failed to load customizations:', error);
                cachedCustomizations = [];
            }

            return cachedCustomizations;
        },

        async getDataExtensionSchemas(): Promise<DataExtensionSchema[]> {
            if (cachedExtensionSchemas) return cachedExtensionSchemas;

            try {
                const result = await querySchemas(wixClient, {
                    filter: { namespace: 'wix.stores.catalog.v3.product' },
                });
                cachedExtensionSchemas =
                    (result?.dataExtensionSchemas as DataExtensionSchema[]) ?? [];
                const fieldCount = cachedExtensionSchemas.reduce(
                    (n, s) => n + Object.keys(s.jsonSchema?.properties ?? {}).length,
                    0,
                );
                console.log(
                    `[wix-stores] Loaded ${cachedExtensionSchemas.length} data extension schema(s), ${fieldCount} field(s)`,
                );
            } catch (error) {
                console.error('[wix-stores] Failed to load data extension schemas:', error);
                cachedExtensionSchemas = [];
            }

            return cachedExtensionSchemas;
        },

        async getAllProductsCategoryId(): Promise<string | null> {
            if (cachedAllProductsCategoryId !== undefined) return cachedAllProductsCategoryId;
            try {
                const result = await service.products.getAllProductsCategory();
                cachedAllProductsCategoryId = result.categoryId ?? null;
            } catch (error) {
                console.error('[wix-stores] Failed to get All Products category:', error);
                cachedAllProductsCategoryId = null;
            }
            return cachedAllProductsCategoryId;
        },
    };

    registerService(WIX_STORES_SERVICE_MARKER, service);
    return service;
}

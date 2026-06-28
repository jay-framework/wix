/**
 * Server-side Wix Stores Service
 *
 * Provides access to Wix Stores APIs on the server using API Key authentication.
 * Used with .withServices(WIX_STORES_SERVICE_MARKER) in component definitions.
 */

import { WixClient } from '@wix/sdk';
import {
    getCategoriesClient,
    getCustomizationsV3Client,
    getInventoryClient,
    getProductsV3Client,
} from '../utils/wix-store-api';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { type UrlTemplates } from '../config-loader';
import { type CategoryTree } from '../utils/product-mapper';
import { BuildDescriptors } from '@wix/sdk-types';
import { customizationsV3, productsV3 } from '@wix/stores';
import { categories } from '@wix/categories';
import { inventoryItemsV3 } from '@wix/stores';
import { currentCart } from '@wix/ecom';
import { type Customization } from '@wix/auto_sdk_stores_customizations-v-3';
import { schemas as dataExtensionSchemas } from '@wix/data-extension-schema';
import type { DataExtensionSchema } from '../utils/data-extension-schema';

export interface WixStoresService {
    products: BuildDescriptors<typeof productsV3, {}>;
    categories: BuildDescriptors<typeof categories, {}>;
    inventory: BuildDescriptors<typeof inventoryItemsV3, {}>;
    customizations: BuildDescriptors<typeof customizationsV3, {}>;
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

    const categoriesClient = getCategoriesClient(wixClient);
    const customizationsClient = getCustomizationsV3Client(wixClient);

    const service: WixStoresService = {
        products: getProductsV3Client(wixClient),
        categories: categoriesClient,
        inventory: getInventoryClient(wixClient),
        customizations: customizationsClient,
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

        async getCustomizations(): Promise<Customization[]> {
            if (cachedCustomizations) return cachedCustomizations;

            try {
                const result = await customizationsClient
                    .queryCustomizations()
                    .eq('customizationType', 'PRODUCT_OPTION')
                    .limit(100)
                    .find();

                cachedCustomizations = result.items || [];
            } catch (error) {
                console.error('[wix-stores] Failed to load customizations:', error);
                cachedCustomizations = [];
            }

            return cachedCustomizations;
        },

        async getDataExtensionSchemas(): Promise<DataExtensionSchema[]> {
            if (cachedExtensionSchemas) return cachedExtensionSchemas;

            try {
                const client = wixClient.use(dataExtensionSchemas);
                const result = await client.listDataExtensionSchemas(
                    'wix.stores.catalog.v3.product',
                );
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

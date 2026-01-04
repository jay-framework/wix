/**
 * Wix Stores Services
 * 
 * Server-side service for Wix Stores API access.
 */

export {
    WIX_STORES_SERVICE_MARKER,
    provideWixStoresService,
    type WixStoresService,
} from './wix-stores-service.js';

export {
    getProductsV3Client,
    getCategoriesClient,
    getInventoryClient,
    getCurrentCartClient,
} from './wix-store-api.js';


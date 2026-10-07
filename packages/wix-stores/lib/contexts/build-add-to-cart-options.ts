import type { AddToCartOptions } from '@jay-framework/wix-cart';
import { isPreOrderRequest } from '../utils/purchasable';

/** Options passed to wix-cart after resolving a Catalog V3 variant on the client */
export function buildWixStoresAddToCartOptions(
    product: { slug?: string | null },
    variant: {
        _id?: string;
        inventoryStatus?: { inStock?: boolean; preorderEnabled?: boolean };
    },
    translatedModifiers: Record<string, string>,
    translatedCustomTextFields: Record<string, string>,
): AddToCartOptions {
    return {
        variantId: variant._id,
        modifiers: translatedModifiers,
        customTextFields: translatedCustomTextFields,
        productSlug: product.slug,
        preOrderRequested: isPreOrderRequest(variant.inventoryStatus),
    };
}

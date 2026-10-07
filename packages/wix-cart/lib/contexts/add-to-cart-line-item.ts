import type { AddToCartOptions } from './wix-cart-context';

/** Wix Stores App ID for catalog references */
export const WIX_STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

/** The line item that add to cart sends to ecom for a Wix Stores product */
export function buildAddToCartLineItem(
    productId: string,
    quantity: number,
    options?: AddToCartOptions,
) {
    const catalogOptions: Record<string, unknown> = {};
    if (options?.variantId) catalogOptions.variantId = options.variantId;
    if (options?.modifiers) catalogOptions.options = options.modifiers;
    if (options?.customTextFields) catalogOptions.customTextFields = options.customTextFields;
    if (options?.preOrderRequested) catalogOptions.preOrderRequested = true;

    return {
        catalogReference: {
            catalogItemId: productId,
            appId: WIX_STORES_APP_ID,
            ...(Object.keys(catalogOptions).length > 0 ? { options: catalogOptions } : {}),
        },
        quantity,
    };
}

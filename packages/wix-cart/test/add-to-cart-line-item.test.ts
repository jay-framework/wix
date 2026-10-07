// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    buildAddToCartLineItem,
    WIX_STORES_APP_ID,
} from '../lib/contexts/add-to-cart-line-item.js';

describe('buildAddToCartLineItem', () => {
    it('sends catalogReference.options.preOrderRequested for a pre-order, like the Wix storefront', () => {
        expect(
            buildAddToCartLineItem('product-1', 1, {
                variantId: 'variant-1',
                preOrderRequested: true,
            }),
        ).toEqual({
            catalogReference: {
                catalogItemId: 'product-1',
                appId: WIX_STORES_APP_ID,
                options: { variantId: 'variant-1', preOrderRequested: true },
            },
            quantity: 1,
        });
    });

    it('does not flag items that are not pre-orders', () => {
        const options = (preOrderRequested?: boolean) =>
            buildAddToCartLineItem('product-1', 2, { variantId: 'variant-1', preOrderRequested })
                .catalogReference.options;
        expect(options(false)).toEqual({ variantId: 'variant-1' });
        expect(options(undefined)).toEqual({ variantId: 'variant-1' });
    });

    it('keeps modifiers and custom text, and omits empty options', () => {
        expect(
            buildAddToCartLineItem('product-1', 1, {
                variantId: 'variant-1',
                modifiers: { Color: 'Red' },
                customTextFields: { Engraving: 'Hi' },
                preOrderRequested: true,
            }).catalogReference.options,
        ).toEqual({
            variantId: 'variant-1',
            options: { Color: 'Red' },
            customTextFields: { Engraving: 'Hi' },
            preOrderRequested: true,
        });
        expect(buildAddToCartLineItem('product-1', 1).catalogReference).toEqual({
            catalogItemId: 'product-1',
            appId: WIX_STORES_APP_ID,
        });
    });
});

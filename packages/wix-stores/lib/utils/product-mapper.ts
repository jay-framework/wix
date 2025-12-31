/**
 * Shared Product Mapping Utilities
 * 
 * Maps Wix Stores Catalog V3 product responses to view state contracts.
 */

import {
    AvailabilityStatus,
    MediaType,
    PreorderStatus,
    ProductCardViewState,
    ProductType
} from '../contracts/product-card.jay-contract';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format Wix media URL with optional resize parameters
 */
export function formatWixMediaUrl(
    _id: string, 
    url: string, 
    resize?: { w: number; h: number }
): string {
    const resizeFragment = resize ?
        `/v1/fit/w_${resize.w},h_${resize.h},q_90/file.jpg` :
        '';
    if (url)
        return url;
    else
        return `https://static.wixstatic.com/media/${_id}${resizeFragment}`;
}

/**
 * Map availability status string to enum
 */
export function mapAvailabilityStatus(status: string | undefined): AvailabilityStatus {
    switch (status) {
        case 'OUT_OF_STOCK': return AvailabilityStatus.OUT_OF_STOCK;
        case 'PARTIALLY_OUT_OF_STOCK': return AvailabilityStatus.PARTIALLY_OUT_OF_STOCK;
        default: return AvailabilityStatus.IN_STOCK;
    }
}

/**
 * Map preorder status string to enum
 */
export function mapPreorderStatus(status: string | undefined): PreorderStatus {
    switch (status) {
        case 'ENABLED': return PreorderStatus.ENABLED;
        case 'PARTIALLY_ENABLED': return PreorderStatus.PARTIALLY_ENABLED;
        default: return PreorderStatus.DISABLED;
    }
}

/**
 * Map media type string to enum
 */
export function mapMediaType(mediaType: string | undefined): MediaType {
    return mediaType === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE;
}

/**
 * Map product type string to enum
 */
export function mapProductType(productType: string | undefined): ProductType {
    return productType === 'DIGITAL' ? ProductType.DIGITAL : ProductType.PHYSICAL;
}

/**
 * Check if a price amount represents a valid price (not zero or empty)
 */
function isValidPrice(amount: string | undefined): boolean {
    if (!amount) return false;
    const numAmount = parseFloat(amount);
    return !isNaN(numAmount) && numAmount > 0;
}

// ============================================================================
// Product Card Mapper
// ============================================================================

/** Default path for product pages */
const DEFAULT_PRODUCT_PAGE_PATH = '/products';

/**
 * Map a Wix Stores Catalog V3 product to ProductCardViewState
 * 
 * In Catalog V3, prices come from variantsInfo.variants[0].price
 * Falls back to actualPriceRange/compareAtPriceRange for compatibility
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProductToCard(
    product: any, 
    productPagePath: string = DEFAULT_PRODUCT_PAGE_PATH
): ProductCardViewState {
    const mainMedia = product.media?.main;
    const slug = product.slug || '';
    
    // In Catalog V3, prices come from variantsInfo.variants[0].price
    // Fall back to actualPriceRange/compareAtPriceRange for backwards compatibility
    const firstVariant = product.variantsInfo?.variants?.[0];
    const variantPrice = firstVariant?.price;
    
    // Get actual price - prefer variant price, fall back to price range
    const actualAmount = variantPrice?.actualPrice?.amount || 
                         product.actualPriceRange?.minValue?.amount || '0';
    const actualFormattedAmount = variantPrice?.actualPrice?.formattedAmount || 
                                   product.actualPriceRange?.minValue?.formattedAmount || '';
    
    // Get compare-at price (for discounts)
    const compareAtAmount = variantPrice?.compareAtPrice?.amount || 
                            product.compareAtPriceRange?.minValue?.amount;
    const compareAtFormattedAmount = variantPrice?.compareAtPrice?.formattedAmount || 
                                      product.compareAtPriceRange?.minValue?.formattedAmount || '';
    
    // Has discount if compare-at price is valid and different from actual price
    const hasDiscount = isValidPrice(compareAtAmount) && compareAtAmount !== actualAmount;

    return {
        _id: product._id || '',
        name: product.name || '',
        slug,
        productUrl: slug ? `${productPagePath}/${slug}` : '',
        mainMedia: {
            url: mainMedia ? formatWixMediaUrl(mainMedia._id, mainMedia.url) : '',
            altText: mainMedia?.altText || product.name || '',
            mediaType: mapMediaType(mainMedia?.mediaType)
        },
        thumbnail: {
            url: mainMedia ? formatWixMediaUrl(mainMedia._id, mainMedia.url, { w: 300, h: 300 }) : '',
            altText: mainMedia?.altText || product.name || '',
            width: 300,
            height: 300
        },
        actualPriceRange: {
            minValue: {
                amount: actualAmount,
                formattedAmount: actualFormattedAmount
            },
            maxValue: {
                amount: product.actualPriceRange?.maxValue?.amount || actualAmount,
                formattedAmount: product.actualPriceRange?.maxValue?.formattedAmount || actualFormattedAmount
            }
        },
        compareAtPriceRange: {
            minValue: {
                amount: compareAtAmount || '0',
                formattedAmount: hasDiscount ? compareAtFormattedAmount : ''
            },
            maxValue: {
                amount: product.compareAtPriceRange?.maxValue?.amount || compareAtAmount || '0',
                formattedAmount: hasDiscount ? (product.compareAtPriceRange?.maxValue?.formattedAmount || compareAtFormattedAmount) : ''
            }
        },
        currency: product.currency || 'USD',
        hasDiscount,
        inventory: {
            availabilityStatus: mapAvailabilityStatus(product.inventory?.availabilityStatus),
            preorderStatus: mapPreorderStatus(product.inventory?.preorderStatus)
        },
        ribbon: {
            _id: product.ribbon?._id || '',
            name: product.ribbon?.name || ''
        },
        hasRibbon: !!product.ribbon?.name,
        brand: {
            _id: product.brand?._id || '',
            name: product.brand?.name || ''
        },
        productType: mapProductType(product.productType),
        visible: product.visible !== false,
        isAddingToCart: false
    };
}


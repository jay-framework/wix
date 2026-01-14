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
    ProductType,
    QuickAddType
} from '../contracts/product-card.jay-contract';
import {
    ChoiceType,
    OptionRenderType,
    ProductOptionsViewState
} from '../contracts/product-options.jay-contract';

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
// Quick Add Option Mapping
// ============================================================================

/**
 * Determine the quick add behavior type for a product.
 * - SIMPLE: No options, show regular Add to Cart button
 * - SINGLE_OPTION: One option, show choices on hover (click = add to cart)
 * - NEEDS_CONFIGURATION: Multiple options or modifiers, link to product page
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getQuickAddType(product: any): QuickAddType {
    const optionCount = product.options?.length ?? 0;
    const hasModifiers = (product.modifiers?.length ?? 0) > 0;
    
    if (hasModifiers || optionCount > 1) {
        return QuickAddType.NEEDS_CONFIGURATION;
    }
    if (optionCount === 1) {
        return QuickAddType.SINGLE_OPTION;
    }
    return QuickAddType.SIMPLE;
}

/**
 * Map option render type string to enum
 */
function mapOptionRenderType(renderType: string | undefined): OptionRenderType {
    return renderType === 'COLOR_SWATCH_CHOICES' 
        ? OptionRenderType.COLOR_SWATCH_CHOICES 
        : OptionRenderType.TEXT_CHOICES;
}

/**
 * Map choice type string to enum
 */
function mapChoiceType(choiceType: string | undefined): ChoiceType {
    return choiceType === 'ONE_COLOR' ? ChoiceType.ONE_COLOR : ChoiceType.CHOICE_TEXT;
}

/**
 * Map the primary option for quick-add functionality.
 * For single-option products, maps the option with variant info to determine stock.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapQuickOption(option: any, variantsInfo: any): ProductOptionsViewState | null {
    if (!option) return null;
    
    const optionId = option._id;
    const choices = option.choicesSettings?.choices || [];
    const variants = variantsInfo?.variants || [];
    
    // Build a map from choiceId -> variantId and inStock status
    // For single-option products, each choice maps to exactly one variant
    const choiceToVariant = new Map<string, { variantId: string; inStock: boolean }>();
    
    for (const variant of variants) {
        // Find the choice for this option in this variant
        const variantChoice = variant.choices?.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any) => c.optionChoiceIds?.optionId === optionId
        );
        if (variantChoice) {
            const choiceId = variantChoice.optionChoiceIds?.choiceId;
            if (choiceId) {
                choiceToVariant.set(choiceId, {
                    variantId: variant._id,
                    inStock: variant.inventoryStatus?.inStock ?? false
                });
            }
        }
    }
    
    return {
        _id: optionId,
        name: option.name || '',
        optionRenderType: mapOptionRenderType(option.optionRenderType),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        choices: choices.map((choice: any) => {
            const variantInfo = choiceToVariant.get(choice.choiceId);
            return {
                choiceId: choice.choiceId || '',
                name: choice.name || '',
                choiceType: mapChoiceType(choice.choiceType),
                colorCode: choice.colorCode || '',
                inStock: variantInfo?.inStock ?? choice.inStock ?? false,
                variantId: variantInfo?.variantId || '',
                isSelected: false
            };
        })
    };
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
        isAddingToCart: false,
        // Quick add behavior
        quickAddType: getQuickAddType(product),
        quickOption: getQuickAddType(product) === QuickAddType.SINGLE_OPTION
            ? mapQuickOption(product.options?.[0], product.variantsInfo)
            : null
    };
}


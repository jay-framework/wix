/**
 * Wix Stores Catalog V1 Product Mapping Utilities
 * 
 * Maps Wix Stores Catalog V1 product responses to view state contracts.
 * 
 * Key V1 vs V3 differences handled here:
 * - V1 prices are numbers (289), V3 are strings ("120")
 * - V1 has price.formatted.price, V3 doesn't include formatted in response
 * - V1 uses stock.inStock/inventoryStatus, V3 uses inventory.availabilityStatus
 * - V1 media URLs are complete, V3 uses wix:image:// URIs
 * - V1 uses productOptions[], V3 uses options[]
 * 
 * Reference: wix/exploration/query-products-catalog-v1/output/individual/*.json
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
import {Product} from "@wix/auto_sdk_stores_products";
import {Collection} from "@wix/auto_sdk_stores_collections/build/cjs/index.typings";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map V1 inventory status to ViewState enum
 */
export function mapAvailabilityStatus(status: string | undefined): AvailabilityStatus {
    switch (status) {
        case 'OUT_OF_STOCK': return AvailabilityStatus.OUT_OF_STOCK;
        case 'PARTIALLY_OUT_OF_STOCK': return AvailabilityStatus.PARTIALLY_OUT_OF_STOCK;
        default: return AvailabilityStatus.IN_STOCK;
    }
}

/**
 * V1 doesn't have preorder in the same format - default to DISABLED
 */
export function mapPreorderStatus(): PreorderStatus {
    return PreorderStatus.DISABLED;
}

/**
 * Map V1 media type (lowercase) to ViewState enum (uppercase)
 */
export function mapMediaType(mediaType: string | undefined): MediaType {
    return mediaType === 'video' ? MediaType.VIDEO : MediaType.IMAGE;
}

/**
 * Map V1 product type (lowercase) to ViewState enum (uppercase)
 */
export function mapProductType(productType: string | undefined): ProductType {
    return productType === 'digital' ? ProductType.DIGITAL : ProductType.PHYSICAL;
}

/**
 * Check if a product has a discount
 */
function hasProductDiscount(product: Product): boolean {
    const price = product.price?.price || 0;
    const discountedPrice = product.price?.discountedPrice || price;
    return discountedPrice < price;
}

// ============================================================================
// Quick Add Option Mapping
// ============================================================================

/**
 * Determine the quick add behavior type for a V1 product.
 */
export function getQuickAddType(product: Product): QuickAddType {
    const optionCount = product.productOptions?.length ?? 0;
    
    // V1 doesn't have modifiers in the same way as V3
    if (optionCount > 1) {
        return QuickAddType.NEEDS_CONFIGURATION;
    }
    if (optionCount === 1) {
        return QuickAddType.SINGLE_OPTION;
    }
    return QuickAddType.SIMPLE;
}

/**
 * Map option render type from V1 optionType
 */
function mapOptionRenderType(optionType: string | undefined): OptionRenderType {
    return optionType === 'color' 
        ? OptionRenderType.COLOR_SWATCH_CHOICES 
        : OptionRenderType.TEXT_CHOICES;
}

/**
 * Map the primary option for quick-add functionality (V1)
 */
export function mapQuickOption(
    option: Product['productOptions'][0] | undefined,
    variants: Product['variants'] | undefined
): ProductOptionsViewState | null {
    if (!option) return null;
    
    const choices = option.choices || [];

    return {
        _id: option.name,
        name: option.name || '',
        optionRenderType: mapOptionRenderType(option.optionType),
        choices: choices.map((choice) => {
            // Find variant for this choice to get stock info
            const variant = variants?.find(v => 
                Object.values(v.choices).includes(choice.value)
            );
            
            return {
                choiceId: choice.description,
                name: choice.value || '',
                choiceType: option.optionType === 'color' 
                    ? ChoiceType.ONE_COLOR 
                    : ChoiceType.CHOICE_TEXT,
                colorCode: '', // V1 doesn't store color code in choices
                inStock: variant?.stock?.inStock ?? choice.inStock ?? true,
                variantId: variant?._id || '',
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
 * Map a Wix Stores Catalog V1 product to ProductCardViewState
 * 
 * Key mapping differences from V3:
 * - V1 prices are numbers, convert to strings for ViewState
 * - V1 provides formatted prices directly
 * - V1 media URLs are complete (no need for wix image URL formatting)
 * - V1 uses stock.inventoryStatus instead of inventory.availabilityStatus
 */
export function mapProductToCard(
    product: Product,
    productPagePath: string = DEFAULT_PRODUCT_PAGE_PATH
): ProductCardViewState {
    const mainMedia = product.media?.mainMedia;
    const slug = product.slug || '';
    
    // V1 prices are numbers - convert to strings for ViewState
    const actualPrice = product.price?.discountedPrice ?? product.price?.price ?? 0;
    const compareAtPrice = product.price?.price ?? 0;
    const formattedActualPrice = product.price?.formatted?.discountedPrice || '';
    const formattedCompareAtPrice = product.price?.formatted?.price || '';
    
    const hasDiscount = hasProductDiscount(product);

    return {
        _id: product._id || '',
        name: product.name || '',
        slug,
        productUrl: slug ? `${productPagePath}/${slug}` : '',
        mainMedia: {
            // V1 provides complete URLs
            url: mainMedia?.image?.url || '',
            altText: mainMedia?.title || product.name || '',
            mediaType: mapMediaType(mainMedia?.mediaType)
        },
        thumbnail: {
            // V1 provides complete thumbnail URLs
            url: mainMedia?.thumbnail?.url || '',
            altText: mainMedia?.title || product.name || '',
            width: mainMedia?.thumbnail?.width || 300,
            height: mainMedia?.thumbnail?.height || 300
        },
        // Convert V1 number prices to string amounts
        actualPriceRange: {
            minValue: {
                amount: String(actualPrice),
                formattedAmount: formattedActualPrice
            },
            maxValue: {
                amount: String(product.priceRange?.maxValue ?? actualPrice),
                formattedAmount: formattedActualPrice
            }
        },
        compareAtPriceRange: {
            minValue: {
                amount: String(compareAtPrice),
                formattedAmount: hasDiscount ? formattedCompareAtPrice : ''
            },
            maxValue: {
                amount: String(compareAtPrice),
                formattedAmount: hasDiscount ? formattedCompareAtPrice : ''
            }
        },
        currency: product.price?.currency || 'USD',
        hasDiscount,
        inventory: {
            // V1 uses stock.inventoryStatus
            availabilityStatus: mapAvailabilityStatus(product.stock?.inventoryStatus),
            preorderStatus: mapPreorderStatus()
        },
        ribbon: {
            _id: product.ribbon || '',
            name: product.ribbon || ''
        },
        hasRibbon: !!product.ribbon,
        brand: {
            _id: product.brand || '',
            name: product.brand || ''
        },
        productType: mapProductType(product.productType),
        visible: product.visible !== false,
        isAddingToCart: false,
        // Quick add behavior
        quickAddType: getQuickAddType(product),
        quickOption: getQuickAddType(product) === QuickAddType.SINGLE_OPTION
            ? mapQuickOption(product.productOptions?.[0], product.variants)
            : null
    };
}

// ============================================================================
// Collection Mapper (V1 uses collections, not categories)
// ============================================================================

export interface V1Collection {
    _id?: string;
    name?: string;
    slug?: string;
    description?: string;
    media?: {
        mainMedia?: {
            image?: {
                url: string;
            };
        };
    };
    numberOfProducts?: number;
}

export interface CollectionViewState {
    _id: string;
    name: string;
    slug: string;
    description: string;
    imageUrl: string;
    productCount: number;
}

/**
 * Map V1 Collection to a view state
 */
export function mapCollectionToViewState(collection: Collection): CollectionViewState {
    return {
        _id: collection._id,
        name: collection.name || '',
        slug: collection.slug || '',
        description: collection.description || '',
        imageUrl: collection.media?.mainMedia?.image?.url || '',
        productCount: collection.numberOfProducts || 0
    };
}

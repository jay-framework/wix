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
    QuickAddType,
} from '../contracts/product-card.jay-contract';
import {
    ChoiceType,
    OptionRenderType,
    ProductOptionsViewState,
} from '../contracts/product-options.jay-contract';
import { formatWixMediaUrl } from '@jay-framework/wix-utils';
import { type UrlTemplates } from '../config-loader';

// ============================================================================
// Category Tree — cached category hierarchy for URL resolution
// ============================================================================

/**
 * Cached category hierarchy data, used for resolving category slugs and parent chains.
 * Built lazily from the Wix Categories API and cached on the service.
 */
export interface CategoryTree {
    /** Map of categoryId → slug */
    slugMap: Map<string, string>;
    /** Map of categoryId → parent categoryId */
    parentMap: Map<string, string>;
    /** Set of root category IDs (categories with no parent) */
    rootIds: Set<string>;
    /** Map of categoryId → image URL (only for categories that have an image) */
    imageMap: Map<string, string>;
}

/**
 * Find the root category ID for a given category by walking up the parent chain.
 */
export function findRootCategoryId(categoryId: string, tree: CategoryTree): string {
    let current = categoryId;
    for (let depth = 0; depth < 20; depth++) {
        if (tree.rootIds.has(current)) {
            return current;
        }
        const parentId = tree.parentMap.get(current);
        if (!parentId) return current;
        current = parentId;
    }
    return current;
}

/**
 * Get the slug of the root category for a given category.
 */
export function findRootCategorySlug(categoryId: string, tree: CategoryTree): string {
    const rootId = findRootCategoryId(categoryId, tree);
    return tree.slugMap.get(rootId) ?? '';
}

/**
 * Find the image URL for a category, walking up the parent chain if the category has no image.
 * Returns the first image found in the ancestry, or empty string.
 */
export function findCategoryImage(categoryId: string, tree: CategoryTree): string {
    let current: string | undefined = categoryId;
    for (let depth = 0; depth < 20 && current; depth++) {
        const image = tree.imageMap.get(current);
        if (image) return image;
        current = tree.parentMap.get(current);
    }
    return '';
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build a product URL from the template, resolving {slug}, {category}, {prefix}.
 * Defaults to placeholders if values are not provided
 */
export function buildProductUrl(
    urls: UrlTemplates,
    tree: CategoryTree,
    slug: string,
    mainCategoryId: string,
): string | null {
    let url = urls.product;
    url = url.replace('{slug}', slug);

    if (url.includes('{category}')) {
        const categorySlug = tree.slugMap.get(mainCategoryId);
        url = url.replace('{category}', categorySlug);
    }

    if (url.includes('{prefix}')) {
        const prefixSlug = findRootCategorySlug(mainCategoryId, tree);
        url = url.replace('{prefix}', prefixSlug);
    }

    return url;
}

/**
 * Build a category URL from the template, resolving {category} and {prefix}.
 * Returns null if template is null or a required placeholder can't be resolved.
 */
export function buildCategoryUrl(
    urls: UrlTemplates,
    tree: CategoryTree,
    categorySlug: string,
    categoryId: string,
): string | null {
    if (!urls.category) return null;

    let url = urls.category;
    url = url.replace('{category}', categorySlug);

    if (url.includes('{prefix}')) {
        const prefixSlug = findRootCategorySlug(categoryId, tree);
        if (!prefixSlug) return null;
        url = url.replace('{prefix}', prefixSlug);
    }

    return url.includes('{') ? null : url;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function mapAvailabilityStatus(status: string | undefined): AvailabilityStatus {
    switch (status) {
        case 'OUT_OF_STOCK':
            return AvailabilityStatus.OUT_OF_STOCK;
        case 'PARTIALLY_OUT_OF_STOCK':
            return AvailabilityStatus.PARTIALLY_OUT_OF_STOCK;
        default:
            return AvailabilityStatus.IN_STOCK;
    }
}

export function mapPreorderStatus(status: string | undefined): PreorderStatus {
    switch (status) {
        case 'ENABLED':
            return PreorderStatus.ENABLED;
        case 'PARTIALLY_ENABLED':
            return PreorderStatus.PARTIALLY_ENABLED;
        default:
            return PreorderStatus.DISABLED;
    }
}

export function mapMediaType(mediaType: string | undefined): MediaType {
    return mediaType === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE;
}

export function mapProductType(productType: string | undefined): ProductType {
    return productType === 'DIGITAL' ? ProductType.DIGITAL : ProductType.PHYSICAL;
}

function isValidPrice(amount: string | undefined): boolean {
    if (!amount) return false;
    const numAmount = parseFloat(amount);
    return !isNaN(numAmount) && numAmount > 0;
}

// ============================================================================
// Quick Add Option Mapping
// ============================================================================

export function getQuickAddType(product: {
    options?: WixOption[];
    modifiers?: unknown[];
}): QuickAddType {
    const optionCount = product.options?.length ?? 0;
    const hasModifiers = (product.modifiers?.length ?? 0) > 0;

    if (hasModifiers || optionCount > 2) {
        return QuickAddType.NEEDS_CONFIGURATION;
    }
    if (optionCount === 2) {
        const hasColor = product.options!.some(
            (o) => o.optionRenderType === 'COLOR_SWATCH_CHOICES',
        );
        const hasText = product.options!.some((o) => o.optionRenderType !== 'COLOR_SWATCH_CHOICES');
        if (hasColor && hasText) {
            return QuickAddType.COLOR_AND_TEXT_OPTIONS;
        }
        return QuickAddType.NEEDS_CONFIGURATION;
    }
    if (optionCount === 1) {
        return QuickAddType.SINGLE_OPTION;
    }
    return QuickAddType.SIMPLE;
}

function mapOptionRenderType(renderType: string | undefined): OptionRenderType {
    return renderType === 'COLOR_SWATCH_CHOICES'
        ? OptionRenderType.COLOR_SWATCH_CHOICES
        : OptionRenderType.TEXT_CHOICES;
}

function mapChoiceType(choiceType: string | undefined): ChoiceType {
    return choiceType === 'ONE_COLOR' ? ChoiceType.ONE_COLOR : ChoiceType.CHOICE_TEXT;
}

interface WixOption {
    _id?: string;
    name?: string;
    optionRenderType?: string;
    choicesSettings?: { choices?: WixChoice[] };
}

interface WixChoice {
    choiceId?: string;
    name?: string;
    choiceType?: string;
    colorCode?: string;
    inStock?: boolean;
}

export function mapQuickOption(
    option: WixOption | undefined,
    variantsInfo: unknown,
): ProductOptionsViewState | null {
    if (!option) return null;

    const choices = option.choicesSettings?.choices || [];

    return {
        _id: option._id || '',
        name: option.name || '',
        optionRenderType: mapOptionRenderType(option.optionRenderType),
        choices: choices.map((choice) => ({
            choiceId: choice.choiceId || '',
            name: choice.name || '',
            choiceType: mapChoiceType(choice.choiceType),
            colorCode: choice.colorCode || '',
            inStock: choice.inStock ?? true,
            isSelected: false,
        })),
    };
}

// ============================================================================
// Two-Option Quick Add (COLOR_AND_TEXT_OPTIONS)
// ============================================================================

/** Variant stock map: colorChoiceId -> textChoiceId -> inStock */
export type VariantStockMap = Record<string, Record<string, boolean>>;

/** Per-product variant stock maps: productId -> VariantStockMap */
export type VariantStockMaps = Record<string, VariantStockMap>;

/**
 * Build a stock availability matrix for color+text two-option products.
 * Maps colorChoiceId -> textChoiceId -> inStock.
 */
function buildVariantStockMap(
    colorOption: WixOption,
    textOption: WixOption,
    variants: V3ProductForCard['variantsInfo']['variants'],
): VariantStockMap {
    const stockMap: VariantStockMap = {};
    if (!variants) return stockMap;

    const colorOptionId = colorOption._id || '';
    const textOptionId = textOption._id || '';
    const colorChoices = colorOption.choicesSettings?.choices || [];
    const textChoices = textOption.choicesSettings?.choices || [];

    for (const colorChoice of colorChoices) {
        const cId = colorChoice.choiceId || '';
        stockMap[cId] = {};
        for (const textChoice of textChoices) {
            const tId = textChoice.choiceId || '';
            const variant = variants.find(
                (v) =>
                    v.choices?.some(
                        (c) =>
                            c.optionChoiceIds?.optionId === colorOptionId &&
                            c.optionChoiceIds?.choiceId === cId,
                    ) &&
                    v.choices?.some(
                        (c) =>
                            c.optionChoiceIds?.optionId === textOptionId &&
                            c.optionChoiceIds?.choiceId === tId,
                    ),
            );
            stockMap[cId][tId] = variant?.inventoryStatus?.inStock ?? false;
        }
    }

    return stockMap;
}

/**
 * Map quick-add options based on quickAddType.
 *
 * - SINGLE_OPTION: quickOption = the single option, secondQuickOption = null
 * - COLOR_AND_TEXT_OPTIONS: quickOption = color (first in-stock pre-selected),
 *   secondQuickOption = text option, variantStockMap populated
 * - Otherwise: both null
 */
function mapQuickAddOptions(
    product: V3ProductForCard,
): Pick<ProductCardViewState, 'quickAddType' | 'quickOption' | 'secondQuickOption'> & {
    variantStockMap: VariantStockMap | null;
} {
    const quickAddType = getQuickAddType(product);

    if (quickAddType === QuickAddType.COLOR_AND_TEXT_OPTIONS) {
        const colorOption = product.options!.find(
            (o) => o.optionRenderType === 'COLOR_SWATCH_CHOICES',
        )!;
        const textOption = product.options!.find(
            (o) => o.optionRenderType !== 'COLOR_SWATCH_CHOICES',
        )!;
        const quickOption = mapQuickOption(colorOption, product.variantsInfo);
        const secondQuickOption = mapQuickOption(textOption, product.variantsInfo);

        // Pre-select first in-stock color
        if (quickOption?.choices) {
            const firstInStock = quickOption.choices.find((c) => c.inStock);
            if (firstInStock) {
                firstInStock.isSelected = true;
            }
        }

        // Build variant stock map
        const variantStockMap = buildVariantStockMap(
            colorOption,
            textOption,
            product.variantsInfo?.variants,
        );

        // Set initial text choice inStock based on pre-selected color
        const selectedColor = quickOption?.choices?.find((c) => c.isSelected);
        if (selectedColor && secondQuickOption?.choices) {
            const colorStock = variantStockMap[selectedColor.choiceId];
            if (colorStock) {
                for (const textChoice of secondQuickOption.choices) {
                    textChoice.inStock = colorStock[textChoice.choiceId] ?? false;
                }
            }
        }

        return { quickAddType, quickOption, secondQuickOption, variantStockMap };
    }

    if (quickAddType === QuickAddType.SINGLE_OPTION) {
        return {
            quickAddType,
            quickOption: mapQuickOption(product.options?.[0], product.variantsInfo),
            secondQuickOption: null,
            variantStockMap: null,
        };
    }

    return { quickAddType, quickOption: null, secondQuickOption: null, variantStockMap: null };
}

type QuickAddResult = ReturnType<typeof mapQuickAddOptions>;

/** Extract only the view state fields (no variantStockMap) */
function pickQuickAddViewState(
    result: QuickAddResult,
): Pick<ProductCardViewState, 'quickAddType' | 'quickOption' | 'secondQuickOption'> {
    return {
        quickAddType: result.quickAddType,
        quickOption: result.quickOption,
        secondQuickOption: result.secondQuickOption,
    };
}

// ============================================================================
// Product Card Mapper
// ============================================================================

/** Minimal product shape expected by the mapper (Wix Catalog V3) */
export interface V3ProductForCard {
    _id?: string;
    name?: string;
    slug?: string;
    mainCategoryId?: string;
    media?: { main?: { _id?: string; url?: string; altText?: string; mediaType?: string } };
    variantsInfo?: {
        variants?: Array<{
            _id?: string;
            choices?: Array<{
                optionChoiceIds?: { optionId?: string; choiceId?: string };
            }>;
            price?: {
                actualPrice?: { amount?: string; formattedAmount?: string };
                compareAtPrice?: { amount?: string; formattedAmount?: string };
            };
            inventoryStatus?: { inStock?: boolean };
        }>;
    };
    actualPriceRange?: { minValue?: { amount?: string; formattedAmount?: string } };
    compareAtPriceRange?: { minValue?: { amount?: string; formattedAmount?: string } };
    inventory?: { availabilityStatus?: string; preorderStatus?: string };
    ribbon?: { _id?: string; name?: string };
    brand?: { _id?: string; name?: string };
    productType?: string;
    options?: WixOption[];
    modifiers?: unknown[];
}

export interface MappedProductCard {
    viewState: ProductCardViewState;
    variantStockMap: VariantStockMap | null;
}

/**
 * Map a Wix Stores Catalog V3 product to ProductCardViewState,
 * along with variant stock map for COLOR_AND_TEXT_OPTIONS products.
 */
export function mapProductToCard(
    product: V3ProductForCard,
    urls: UrlTemplates,
    tree: CategoryTree,
): MappedProductCard {
    const mainMedia = product.media?.main;
    const slug = product.slug || '';
    const mainCategoryId = product.mainCategoryId || '';

    const productUrl = buildProductUrl(urls, tree, slug, mainCategoryId);
    const categoryName = tree.slugMap.get(mainCategoryId);

    const firstVariant = product.variantsInfo?.variants?.[0];
    const variantPrice = firstVariant?.price;

    const actualAmount =
        variantPrice?.actualPrice?.amount || product.actualPriceRange?.minValue?.amount || '0';
    const actualFormattedAmount =
        variantPrice?.actualPrice?.formattedAmount ||
        product.actualPriceRange?.minValue?.formattedAmount ||
        '';

    const compareAtAmount =
        variantPrice?.compareAtPrice?.amount || product.compareAtPriceRange?.minValue?.amount;
    const compareAtFormattedAmount =
        variantPrice?.compareAtPrice?.formattedAmount ||
        product.compareAtPriceRange?.minValue?.formattedAmount ||
        '';

    const hasDiscount = isValidPrice(compareAtAmount) && compareAtAmount !== actualAmount;
    const quickAddResult = mapQuickAddOptions(product);

    const viewState: ProductCardViewState = {
        _id: product._id || '',
        name: product.name || '',
        slug,
        productUrl,
        categoryPrefix: categoryName,
        mainMedia: {
            url: mainMedia ? formatWixMediaUrl(mainMedia._id, mainMedia.url) : '',
            altText: mainMedia?.altText || product.name || '',
            mediaType: mapMediaType(mainMedia?.mediaType),
        },
        thumbnail: {
            url: mainMedia
                ? formatWixMediaUrl(mainMedia._id, mainMedia.url, { w: 300, h: 300 })
                : '',
            altText: mainMedia?.altText || product.name || '',
            width: 300,
            height: 300,
        },
        price: actualFormattedAmount,
        strikethroughPrice: hasDiscount ? compareAtFormattedAmount : '',
        hasDiscount,
        inventory: {
            availabilityStatus: mapAvailabilityStatus(product.inventory?.availabilityStatus),
            preorderStatus: mapPreorderStatus(product.inventory?.preorderStatus),
        },
        ribbon: {
            _id: product.ribbon?._id || '',
            name: product.ribbon?.name || '',
        },
        hasRibbon: !!product.ribbon?.name,
        brand: {
            _id: product.brand?._id || '',
            name: product.brand?.name || '',
        },
        productType: mapProductType(product.productType),
        isAddingToCart: false,
        ...pickQuickAddViewState(quickAddResult),
    };

    return { viewState, variantStockMap: quickAddResult.variantStockMap };
}

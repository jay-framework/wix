/**
 * Wix Stores / Categories / Inventory types.
 * Matches the REST V3 API response shape after normalizeProduct.
 */

// ============================================================================
// Products V3 (REST API shape, after normalization)
// ============================================================================

export type MediaTypeWithLiterals = 'IMAGE' | 'VIDEO' | (string & {});
export type ChoiceTypeWithLiterals = 'CHOICE_TEXT' | 'ONE_COLOR' | (string & {});
export type ModifierRenderTypeWithLiterals =
    | 'FREE_TEXT'
    | 'TEXT_CHOICES'
    | 'SWATCH_CHOICES'
    | (string & {});

export interface ConnectedOptionChoice {
    choiceId?: string;
    name?: string;
    key?: string;
    choiceType?: ChoiceTypeWithLiterals;
    colorCode?: string;
    inStock?: boolean;
    visible?: boolean;
    linkedMedia?: unknown[];
}

export interface ConnectedOption {
    _id?: string;
    name?: string;
    optionRenderType?: string;
    choicesSettings?: { choices?: ConnectedOptionChoice[] };
    key?: string;
}

export interface ConnectedModifier {
    _id?: string;
    name?: string;
    modifierRenderType?: ModifierRenderTypeWithLiterals;
    mandatory?: boolean;
    choicesSettings?: { choices?: ConnectedOptionChoice[] };
    freeTextSettings?: { title?: string; maxCharCount?: number };
    key?: string;
}

export interface InfoSection {
    _id?: string;
    title?: string;
    plainDescription?: string;
    uniqueName?: string;
}

export interface ProductMediaItem {
    _id?: string;
    url?: string;
    altText?: string;
    mediaType?: MediaTypeWithLiterals;
    width?: number;
    height?: number;
}

export interface ProductMedia {
    main?: ProductMediaItem;
    itemsInfo?: { items?: ProductMediaItem[] };
}

export interface VariantChoice {
    optionChoiceIds: { optionId: string; choiceId: string };
    optionChoiceNames?: { optionName?: string; choiceName?: string; renderType?: string };
}

export interface PriceAmount {
    amount?: string;
    formattedAmount?: string;
}

export interface ProductVariant {
    _id?: string;
    visible?: boolean;
    sku?: string;
    choices?: VariantChoice[];
    price?: { actualPrice?: PriceAmount; compareAtPrice?: PriceAmount };
    media?: ProductMediaItem;
    inventoryStatus?: { inStock?: boolean; preorderEnabled?: boolean };
}

export interface VariantsInfo {
    variants?: ProductVariant[];
}

export interface PriceRange {
    minValue?: PriceAmount;
    maxValue?: PriceAmount;
}

export interface ProductInventory {
    availabilityStatus?: string;
    preorderStatus?: string;
    preorderAvailability?: string;
}

export interface SeoSchema {
    tags?: SeoTag[];
    settings?: SeoSettings;
}

export interface SeoTag {
    type?: string;
    props?: Record<string, string>;
    children?: string;
    meta?: Record<string, string>;
    custom?: boolean;
    disabled?: boolean;
}

export interface SeoSettings {
    preventAutoRedirect?: boolean;
    keywords?: SeoKeyword[];
}

export interface SeoKeyword {
    term?: string;
    isMain?: boolean;
    origin?: string;
}

export interface V3Product {
    _id?: string;
    name?: string;
    slug?: string;
    plainDescription?: string;
    description?: string;
    visible?: boolean;
    productType?: string;
    currency?: string;
    numericId?: string;
    mainCategoryId?: string;
    media?: ProductMedia;
    options?: ConnectedOption[];
    modifiers?: ConnectedModifier[];
    infoSections?: InfoSection[];
    variantsInfo?: VariantsInfo;
    actualPriceRange?: PriceRange;
    compareAtPriceRange?: PriceRange;
    inventory?: ProductInventory;
    brand?: { _id?: string; name?: string };
    ribbon?: { _id?: string; name?: string };
    seoData?: SeoSchema;
    physicalProperties?: { pricePerUnitRange?: { minValue?: { description?: string } } };
    extendedFields?: { namespaces?: Record<string, Record<string, unknown>> };
}

// Query/Search types

export interface Paging {
    limit?: number;
    offset?: number;
    cursor?: string;
}

export interface QueryProductsResponse {
    products?: V3Product[];
    metadata?: PagingMetadata;
}

export interface PagingMetadata {
    count?: number;
    offset?: number;
    total?: number;
    cursors?: { next?: string; prev?: string };
    hasNext?: boolean;
}

export interface GetProductResponse {
    product?: V3Product;
}

export interface GetProductBySlugResponse {
    product?: V3Product;
}

// Aggregation types (used in search/filter)

export interface AggregationDataAggregationResults {
    name?: string;
    type?: string;
    fieldPath?: string;
    scalar?: AggregationDataAggregationResultsScalarResult;
    values?: AggregationResultsValueResults;
    ranges?: AggregationResultsRangeResults;
}

export interface AggregationDataAggregationResultsScalarResult {
    type?: string;
    value?: number;
}

export interface AggregationResultsValueResults {
    results?: ValueResult[];
}

export interface ValueResult {
    value?: string;
    count?: number;
}

export interface AggregationResultsRangeResults {
    results?: RangeBucket[];
}

export interface RangeBucket {
    from?: number;
    to?: number;
    count?: number;
}

// ============================================================================
// Categories
// ============================================================================

export interface CategoryMediaItem {
    _id?: string;
    mediaType?: string;
    url?: string;
    image?: { url?: string; width?: number; height?: number; altText?: string };
}

export interface CategoryMedia {
    mainMedia?: CategoryMediaItem;
    items?: CategoryMediaItem[];
}

export interface CategoryBreadcrumb {
    categoryId?: string;
    categoryName?: string;
    categorySlug?: string;
}

export interface Category {
    _id?: string;
    name?: string;
    slug?: string;
    description?: string;
    visible?: boolean;
    numberOfProducts?: number;
    itemCounter?: number;
    image?: string;
    media?: CategoryMedia;
    parentCategory?: { _id?: string; name?: string; slug?: string };
    breadcrumbsInfo?: { breadcrumbs?: CategoryBreadcrumb[] };
    seoData?: SeoSchema;
}

export interface QueryCategoriesResponse {
    categories?: Category[];
    metadata?: PagingMetadata;
}

export interface GetCategoryResponse {
    category?: Category;
}

// ============================================================================
// Inventory V3
// ============================================================================

export interface InventoryItem {
    _id?: string;
    productId?: string;
    trackInventory?: boolean;
    variants?: InventoryVariant[];
}

export interface InventoryVariant {
    variantId?: string;
    quantity?: number;
    inStock?: boolean;
    availableForPreorder?: boolean;
}

export interface QueryInventoryResponse {
    inventoryItems?: InventoryItem[];
    metadata?: PagingMetadata;
}

// ============================================================================
// Customizations V3
// ============================================================================

export interface Customization {
    _id?: string;
    name?: string;
    productId?: string;
    title?: string;
    customizationType?: string;
    customizationRenderType?: string;
    visible?: boolean;
    choicesSettings?: { choices?: CustomizationChoice[] };
}

export interface CustomizationChoice {
    _id?: string;
    name?: string;
    value?: string;
    description?: string;
    colorCode?: string;
    inStock?: boolean;
    surcharge?: number;
}

export interface ListCustomizationsResponse {
    customizations?: Customization[];
}

// ============================================================================
// Data Extension Schema
// ============================================================================

export interface DataExtensionSchema {
    _id?: string;
    namespace?: string;
    jsonSchema?: Record<string, unknown>;
}

export interface QuerySchemasResponse {
    dataExtensionSchemas?: DataExtensionSchema[];
}

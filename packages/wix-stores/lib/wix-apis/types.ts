/**
 * Wix Stores / Categories / Inventory types.
 * Copied and simplified from @wix/auto_sdk_stores_products-v-3,
 * @wix/auto_sdk_categories_categories, etc.
 *
 * Only includes types actually used by the wix-stores package.
 */

// ============================================================================
// Products V3
// ============================================================================

export interface V3Product {
    _id?: string;
    name?: string;
    slug?: string;
    description?: string;
    sku?: string;
    visible?: boolean;
    productType?: string;
    priceData?: PriceData;
    media?: Media;
    stock?: Stock;
    productOptions?: ProductOption[];
    variants?: Variant[];
    brand?: string;
    ribbon?: string;
    numericId?: string;
    weight?: number;
    weightRange?: WeightRange;
    discount?: Discount;
    seoData?: SeoSchema;
    additionalInfoSections?: AdditionalInfoSection[];
    [key: string]: any;
}

export interface PriceData {
    price?: number;
    currency?: string;
    discountedPrice?: number;
    formatted?: FormattedPrice;
    pricePerUnitData?: PricePerUnitData;
}

export interface FormattedPrice {
    price?: string;
    discountedPrice?: string;
    pricePerUnit?: string;
}

export interface PricePerUnitData {
    totalQuantity?: number;
    totalMeasurementUnit?: string;
    baseQuantity?: number;
    baseMeasurementUnit?: string;
}

export interface Media {
    items?: MediaItem[];
    mainMedia?: MediaItem;
}

export interface MediaItem {
    _id?: string;
    mediaType?: string;
    url?: string;
    image?: ImageInfo;
    video?: VideoInfo;
    thumbnail?: ImageInfo;
}

export interface ImageInfo {
    url?: string;
    width?: number;
    height?: number;
    altText?: string;
}

export interface VideoInfo {
    url?: string;
}

export interface Stock {
    inventoryStatus?: string;
    quantity?: number;
    trackInventory?: boolean;
    inStock?: boolean;
}

export interface ProductOption {
    _id?: string;
    name?: string;
    optionType?: string;
    choices?: ProductOptionChoice[];
}

export interface ProductOptionChoice {
    _id?: string;
    value?: string;
    description?: string;
    media?: MediaItem;
    inStock?: boolean;
    visible?: boolean;
}

export interface Variant {
    _id?: string;
    choices?: Record<string, string>;
    variant?: VariantData;
}

export interface VariantData {
    priceData?: PriceData;
    stock?: Stock;
    sku?: string;
    weight?: number;
    visible?: boolean;
}

export interface WeightRange {
    minValue?: number;
    maxValue?: number;
}

export interface Discount {
    type?: string;
    value?: number;
}

export interface AdditionalInfoSection {
    _id?: string;
    title?: string;
    description?: string;
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
}

// Query/Search types

export interface V3ProductSearch {
    query?: {
        filter?: any;
        sort?: any[];
        paging?: Paging;
        fields?: string[];
        search?: any;
    };
    includeVariants?: boolean;
    includeMerchantSpecificData?: boolean;
}

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
    scalarResults?: AggregationDataAggregationResultsScalarResult[];
    groupResults?: any;
}

export interface AggregationDataAggregationResultsScalarResult {
    name?: string;
    value?: any;
    type?: string;
}

export interface AggregationResultsRangeResults {
    buckets?: RangeBucket[];
}

export interface RangeBucket {
    from?: number;
    to?: number;
    count?: number;
}

export interface AggregationResultsValueResults {
    values?: ValueResult[];
}

export interface ValueResult {
    value?: string;
    count?: number;
}

// ============================================================================
// Categories
// ============================================================================

export interface Category {
    _id?: string;
    name?: string;
    slug?: string;
    description?: string;
    visible?: boolean;
    numberOfProducts?: number;
    media?: Media;
    parentCategory?: { _id?: string; name?: string; slug?: string };
    [key: string]: any;
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
    [key: string]: any;
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
    productId?: string;
    title?: string;
    customizationType?: string;
    visible?: boolean;
    choices?: CustomizationChoice[];
    [key: string]: any;
}

export interface CustomizationChoice {
    _id?: string;
    value?: string;
    description?: string;
    media?: MediaItem;
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
    jsonSchema?: any;
    [key: string]: any;
}

export interface QuerySchemasResponse {
    schemas?: DataExtensionSchema[];
}

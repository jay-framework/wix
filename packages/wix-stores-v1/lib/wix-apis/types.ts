/**
 * Wix Stores Catalog V1 types.
 * Matches the V1 REST API response shape (after id→_id normalization).
 */

export interface V1Product {
    _id?: string;
    name?: string;
    slug?: string;
    description?: string;
    sku?: string;
    visible?: boolean;
    productType?: string;
    brand?: string;
    ribbon?: string;
    numericId?: string;
    price?: V1Price;
    priceData?: { price?: number; currency?: string };
    stock?: V1Stock;
    media?: V1Media;
    productOptions?: V1ProductOption[];
    variants?: V1Variant[];
    additionalInfoSections?: V1InfoSection[];
    collectionIds?: string[];
    weight?: number;
    seoData?: V1SeoData;
    lastUpdated?: string;
}

export interface V1Price {
    price?: number;
    discountedPrice?: number;
    currency?: string;
    formatted?: {
        price?: string;
        discountedPrice?: string;
        pricePerUnit?: string;
    };
}

export interface V1Stock {
    inStock?: boolean;
    inventoryStatus?: string;
    quantity?: number;
    trackInventory?: boolean;
}

export interface V1Media {
    mainMedia?: V1MediaItem;
    items?: V1MediaItem[];
}

export interface V1MediaItem {
    _id?: string;
    mediaType?: string;
    title?: string;
    image?: { url?: string; width?: number; height?: number };
    video?: { url?: string };
    thumbnail?: { url?: string; width?: number; height?: number };
}

export interface V1ProductOption {
    name?: string;
    optionType?: string;
    choices?: V1ProductChoice[];
}

export interface V1ProductChoice {
    value?: string;
    description?: string;
    inStock?: boolean;
    visible?: boolean;
    media?: V1MediaItem;
}

export interface V1Variant {
    _id?: string;
    choices?: Record<string, string>;
    stock?: { inStock?: boolean; quantity?: number };
    variant?: {
        sku?: string;
        weight?: number;
        visible?: boolean;
        priceData?: {
            price?: number;
            discountedPrice?: number;
            currency?: string;
            formatted?: { price?: string; discountedPrice?: string };
        };
    };
}

export interface V1InfoSection {
    title?: string;
    description?: string;
}

export interface V1SeoData {
    tags?: Array<{ type?: string; props?: Record<string, string>; children?: string }>;
    settings?: {
        preventAutoRedirect?: boolean;
        keywords?: Array<{ term?: string; isMain?: boolean }>;
    };
}

// Collections

export interface V1Collection {
    _id?: string;
    name?: string;
    slug?: string;
    description?: string;
    media?: V1Media;
    numberOfProducts?: number;
}

// Response types

export interface QueryProductsV1Response {
    products?: V1Product[];
    totalResults?: number;
    metadata?: { items?: number; offset?: number };
}

export interface GetProductV1Response {
    product?: V1Product;
}

export interface QueryCollectionsV1Response {
    collections?: V1Collection[];
    totalResults?: number;
    metadata?: { items?: number; offset?: number };
}

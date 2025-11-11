/**
 * Wix Stores Headless Components
 * 
 * Full-stack components for building e-commerce experiences with Wix Stores.
 * Each component provides a headless, type-safe interface to Wix Stores functionality
 * with server-side rendering support for optimal performance and SEO.
 */

// Server Context
export {
    WixStoresContextMarker,
    createWixStoresContext,
    type WixStoresContext
} from './wix-stores-context';

// Product Card Component
export { 
    productCard, 
    type ProductCardProps 
} from './product-card';

// Product Page Component
export { 
    productPage, 
    type ProductPageParams 
} from './product-page';

// Category Page Component
export { 
    categoryPage, 
    type CategoryPageParams,
    type SortOption 
} from './category-page';

// Product Search Component
export { 
    productSearch, 
    type SearchSortOption 
} from './product-search';

// Re-export contract types for convenience
export type {
    ProductCardContract,
    ProductCardRefs,
    AvailabilityStatus as ProductAvailabilityStatus,
    PreorderStatus as ProductPreorderStatus,
    MediaType,
    ProductType
} from '../contracts/product-card.jay-contract';

export type {
    ProductPageContract,
    ProductPageRefs,
    OptionRenderType,
    ChoiceType
} from '../contracts/product-page.jay-contract';

export type {
    CategoryPageContract,
    CategoryPageRefs
} from '../contracts/category-page.jay-contract';

export type {
    ProductSearchContract,
    ProductSearchRefs
} from '../contracts/product-search.jay-contract';


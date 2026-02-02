/**
 * Wix Data Package - Client Entry Point
 * 
 * This is the entry point for client-side imports.
 * Contains only client-safe code (no server secrets).
 */

// Export headless components
export * from './components/collection-item';
export * from './components/collection-list';
export * from './components/collection-card';
export * from './components/collection-table';

// Export client context
export {
    WIX_DATA_CONTEXT,
    provideWixDataContext,
    type WixDataContext,
    type WixDataInitData,
} from './contexts/wix-data-context';

// Export init
export { init } from './init';

// Re-export action types for client-side use
export type {
    QueryItemsInput,
    QueryItemsOutput,
    GetItemBySlugInput,
    GetItemBySlugOutput,
    GetCategoriesInput,
    GetCategoriesOutput,
    CategoryItem,
} from './actions/data-actions';

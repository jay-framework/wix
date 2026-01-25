/**
 * Wix Data Package - Server Entry Point
 * 
 * This is the main entry point for server-side imports.
 * Provides services, actions, and component definitions.
 */

// Export configuration types
export type {
    WixDataConfig,
    CollectionConfig,
    ReferenceConfig,
    CategoryConfig,
    ComponentsConfig,
    CollectionSchema,
    FieldSchema,
    WixDataFieldType,
    ResolvedWixDataConfig,
} from './config/config-types';

// Export config loader
export { loadConfig, validateConfig, validateCollectionConfig } from './config/config-loader';

// Export server service
export {
    provideWixDataService,
    WIX_DATA_SERVICE_MARKER,
    type WixDataService,
} from './services/wix-data-service';

// Export client context types (for type-only imports on server)
export {
    WIX_DATA_CONTEXT,
    type WixDataContext,
    type WixDataInitData,
} from './contexts/wix-data-context';

// Export components
export { collectionItem } from './components/collection-item';
export { collectionList } from './components/collection-list';
export { collectionTable } from './components/collection-table';
export { collectionCard } from './components/collection-card';

// Export server actions
export {
    queryItems,
    getItemBySlug,
    getCategories,
    type QueryItemsInput,
    type QueryItemsOutput,
    type GetItemBySlugInput,
    type GetItemBySlugOutput,
    type GetCategoriesInput,
    type GetCategoriesOutput,
    type CategoryItem,
} from './actions/data-actions';

// Export utilities
export { schemaToContractYaml, toPascalCase } from './utils/schema-to-contract';
export { fetchCollectionSchema, type SchemaFetchResult, type ContractDefinition } from './utils/schema-fetcher';

// Export init
export { init } from './init';

/**
 * Configuration Loader for Wix Data Plugin
 * 
 * Loads and validates wix-data.config.yaml from the project root.
 */

import { WixDataConfig, CollectionConfig } from './types';

// Configuration file name
const CONFIG_FILE_NAME = 'wix-data.config.yaml';

/**
 * Load the wix-data configuration from the project.
 * 
 * Looks for wix-data.config.yaml in the project root.
 * If not found, returns an empty configuration.
 */
export async function loadConfig(): Promise<WixDataConfig> {
    // TODO: Implement actual file loading
    // For now, return empty config - will be populated from project
    console.log(`[wix-data] Looking for ${CONFIG_FILE_NAME}...`);
    
    // In a real implementation:
    // 1. Find project root
    // 2. Load and parse YAML file
    // 3. Validate configuration
    // 4. Return typed config
    
    return {
        collections: []
    };
}

/**
 * Validate a collection configuration
 */
export function validateCollectionConfig(config: CollectionConfig): string[] {
    const errors: string[] = [];
    
    if (!config.collectionId) {
        errors.push('collectionId is required');
    }
    
    if (!config.pathPrefix) {
        errors.push('pathPrefix is required');
    } else if (!config.pathPrefix.startsWith('/')) {
        errors.push('pathPrefix must start with /');
    }
    
    if (!config.slugField) {
        errors.push('slugField is required');
    }
    
    if (!config.components) {
        errors.push('components configuration is required');
    }
    
    // Validate category config if present
    if (config.category) {
        if (!config.category.referenceField) {
            errors.push('category.referenceField is required when category is configured');
        }
        if (!config.category.categorySlugField) {
            errors.push('category.categorySlugField is required when category is configured');
        }
    }
    
    return errors;
}

/**
 * Validate the entire configuration
 */
export function validateConfig(config: WixDataConfig): string[] {
    const errors: string[] = [];
    
    if (!config.collections || config.collections.length === 0) {
        errors.push('At least one collection must be configured');
        return errors;
    }
    
    // Check for duplicate collection IDs
    const seenIds = new Set<string>();
    config.collections.forEach(collection => {
        if (seenIds.has(collection.collectionId)) {
            errors.push(`Duplicate collectionId: ${collection.collectionId}`);
        }
        seenIds.add(collection.collectionId);
        
        // Validate each collection
        const collectionErrors = validateCollectionConfig(collection);
        errors.push(...collectionErrors.map(e => `${collection.collectionId}: ${e}`));
    });
    
    // Check for duplicate path prefixes
    const seenPaths = new Set<string>();
    config.collections.forEach(collection => {
        if (seenPaths.has(collection.pathPrefix)) {
            errors.push(`Duplicate pathPrefix: ${collection.pathPrefix}`);
        }
        seenPaths.add(collection.pathPrefix);
    });
    
    return errors;
}

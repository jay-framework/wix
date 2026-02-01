/**
 * Configuration Loader for Wix Data Plugin
 * 
 * Loads wix-data config from /config/wix-data.yaml.
 * If no config exists, generates a default config from the Wix Data API and saves it.
 */

import * as fs from 'fs';
import * as path from 'path';
import { WixClient } from '@wix/sdk';
import { collections } from '@wix/data';
import * as yaml from 'js-yaml';
import { WixDataConfig, CollectionConfig, ReferenceConfig } from './types';

// Configuration file path (relative to project root)
const CONFIG_DIR = 'config';
const CONFIG_FILE_NAME = 'wix-data.yaml';

/**
 * Get the config file path
 */
function getConfigPath(): string {
    return path.join(process.cwd(), CONFIG_DIR, CONFIG_FILE_NAME);
}

/**
 * Load the wix-data configuration.
 * 
 * - If config file exists: load and parse it
 * - If config file doesn't exist: generate default config from Wix API and save it
 * 
 * @param wixClient - Authenticated Wix client for fetching collections
 */
export async function loadConfig(wixClient: WixClient): Promise<WixDataConfig> {
    const configPath = getConfigPath();
    
    // Check if config file exists
    if (fs.existsSync(configPath)) {
        console.log(`[wix-data] Loading config from ${configPath}`);
        return loadConfigFromFile(configPath);
    }
    
    // No config file - generate default and save
    console.log(`[wix-data] No config found at ${configPath}, generating default...`);
    const defaultConfig = await generateDefaultConfig(wixClient);
    await saveConfig(defaultConfig, configPath);
    
    return defaultConfig;
}

/**
 * Load and parse config from YAML file
 */
function loadConfigFromFile(configPath: string): WixDataConfig {
    try {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const parsed = yaml.load(fileContent) as WixDataConfig;
        
        // Validate basic structure
        if (!parsed || !parsed.collections) {
            console.warn('[wix-data] Invalid config file, using empty config');
            return { collections: [] };
        }
        
        console.log(`[wix-data] Loaded ${parsed.collections.length} collections from config`);
        return parsed;
        
    } catch (error) {
        console.error('[wix-data] Failed to load config file:', error);
        return { collections: [] };
    }
}

/**
 * Save config to YAML file
 */
async function saveConfig(config: WixDataConfig, configPath: string): Promise<void> {
    try {
        // Ensure config directory exists
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Generate YAML with comments
        const yamlContent = generateConfigYaml(config);
        
        fs.writeFileSync(configPath, yamlContent, 'utf-8');
        console.log(`[wix-data] Saved default config to ${configPath}`);
        
    } catch (error) {
        console.error('[wix-data] Failed to save config file:', error);
    }
}

/**
 * Generate YAML content with helpful comments
 */
function generateConfigYaml(config: WixDataConfig): string {
    const header = `# Wix Data Plugin Configuration
# 
# This file was auto-generated from your Wix Data collections.
# Edit this file to configure which collections are visible and how they behave.
#
# Collection visibility:
#   visible: false (default) - Collection is hidden, no contracts generated
#   visible: true - Collection is active, contracts will be generated
#
# Components (only used when visible: true):
#   itemPage: true     - Generate item page component
#   indexPage: true    - Generate index/list page component
#   categoryPage: true - Generate category page component
#   tableWidget: true  - Generate table widget component
#   cardWidget: true   - Generate card widget component
#
# References:
#   mode: link  - Include only the reference ID (default)
#   mode: embed - Fetch and include full referenced item data
#

`;
    
    const yamlBody = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false
    });
    
    return header + yamlBody;
}

/**
 * Generate a default configuration by fetching all collections from Wix Data API.
 * 
 * The generated config:
 * - Lists all collections with their references
 * - Sets visible: false (hidden by default)
 * - Sets empty components
 */
async function generateDefaultConfig(wixClient: WixClient): Promise<WixDataConfig> {
    const collectionsClient = wixClient.use(collections) as unknown as typeof collections;
    
    try {
        // Fetch all collections
        const result = await collectionsClient.listDataCollections({});
        const dataCollections = result.collections || [];
        
        console.log(`[wix-data] Found ${dataCollections.length} collections from Wix API`);
        
        // Map each collection to a config entry
        const collectionConfigs: CollectionConfig[] = dataCollections
            .filter(c => c._id && !c._id.startsWith('_')) // Skip system collections
            .map(collection => {
                const collectionId = collection._id!;
                
                // Find reference fields
                const references: ReferenceConfig[] = (collection.fields || [])
                    .filter(f => f.type === 'REFERENCE' || f.type === 'MULTI_REFERENCE')
                    .map(f => ({
                        fieldName: f.key || '',
                        mode: 'link' as const
                    }));
                
                // Find a suitable slug field (prefer 'slug', then 'title', then '_id')
                const fields = collection.fields || [];
                const slugField = fields.find(f => f.key === 'slug')?.key
                    || fields.find(f => f.key === 'title')?.key
                    || '_id';
                
                const config: CollectionConfig = {
                    collectionId,
                    visible: false, // Hidden by default
                    pathPrefix: `/${collectionId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                    slugField,
                    components: {} // No components enabled by default
                };
                
                // Only add references if there are any
                if (references.length > 0) {
                    config.references = references;
                }
                
                return config;
            });
        
        console.log(`[wix-data] Generated config for ${collectionConfigs.length} collections (all hidden by default)`);
        
        return { collections: collectionConfigs };
        
    } catch (error) {
        console.error('[wix-data] Failed to fetch collections from Wix Data API:', error);
        return { collections: [] };
    }
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
    
    // Check for duplicate path prefixes (only for visible collections)
    const seenPaths = new Set<string>();
    config.collections
        .filter(c => c.visible)
        .forEach(collection => {
            if (seenPaths.has(collection.pathPrefix)) {
                errors.push(`Duplicate pathPrefix: ${collection.pathPrefix}`);
            }
            seenPaths.add(collection.pathPrefix);
        });
    
    return errors;
}

/**
 * Get visible collections from config
 */
export function getVisibleCollections(config: WixDataConfig): CollectionConfig[] {
    return config.collections.filter(c => c.visible === true);
}

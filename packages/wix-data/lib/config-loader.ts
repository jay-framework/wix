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

// Configuration file paths (relative to project root)
const CONFIG_DIR = 'config';
const CONFIG_FILE_NAME = 'wix-data.yaml';
const DOCS_FILE_NAME = 'wix-data-collections.md';

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
    const { config: defaultConfig, collectionData } = await generateDefaultConfig(wixClient);
    await saveConfig(defaultConfig, configPath);

    // Also generate documentation file
    const docsPath = path.join(process.cwd(), CONFIG_DIR, DOCS_FILE_NAME);
    await saveDocumentation(collectionData, docsPath);

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
        sortKeys: false,
    });

    return header + yamlBody;
}

/**
 * Collection data for documentation generation
 */
interface CollectionDocData {
    id: string;
    displayName: string;
    fields: Array<{
        key: string;
        displayName: string;
        type: string;
    }>;
    references: Array<{
        fieldName: string;
        fieldDisplayName: string;
        targetCollection: string;
        isMulti: boolean;
    }>;
}

/**
 * Generate a default configuration by fetching all collections from Wix Data API.
 *
 * Returns both the config and raw collection data for documentation.
 */
async function generateDefaultConfig(wixClient: WixClient): Promise<{
    config: WixDataConfig;
    collectionData: CollectionDocData[];
}> {
    const collectionsClient = wixClient.use(collections) as unknown as typeof collections;

    try {
        // Fetch all collections
        const result = await collectionsClient.listDataCollections({});
        const dataCollections = result.collections || [];

        console.log(`[wix-data] Found ${dataCollections.length} collections from Wix API`);

        // Filter out system collections
        const userCollections = dataCollections.filter((c) => c._id && !c._id.startsWith('_'));

        // Build documentation data and config simultaneously
        const collectionData: CollectionDocData[] = [];
        const collectionConfigs: CollectionConfig[] = [];

        userCollections.forEach((collection) => {
            const collectionId = collection._id!;
            const fields = collection.fields || [];

            // Build reference configs and doc data
            const referenceFields = fields.filter(
                (f) => f.type === 'REFERENCE' || f.type === 'MULTI_REFERENCE',
            );

            const references: ReferenceConfig[] = referenceFields.map((f) => ({
                fieldName: f.key || '',
                mode: 'link' as const,
            }));

            // Extract target collection from field metadata
            const docReferences = referenceFields.map((f) => {
                const meta = f as {
                    typeMetadata?: {
                        reference?: { referencedCollectionId?: string };
                        multiReference?: { referencedCollectionId?: string };
                    };
                };
                const targetCollection =
                    meta.typeMetadata?.reference?.referencedCollectionId ||
                    meta.typeMetadata?.multiReference?.referencedCollectionId ||
                    'unknown';

                return {
                    fieldName: f.key || '',
                    fieldDisplayName: f.displayName || f.key || '',
                    targetCollection,
                    isMulti: f.type === 'MULTI_REFERENCE',
                };
            });

            // Add to documentation data
            collectionData.push({
                id: collectionId,
                displayName: collection.displayName || collectionId,
                fields: fields.map((f) => ({
                    key: f.key || '',
                    displayName: f.displayName || f.key || '',
                    type: f.type || 'unknown',
                })),
                references: docReferences,
            });

            // Find a suitable slug field
            const slugField =
                fields.find((f) => f.key === 'slug')?.key ||
                fields.find((f) => f.key === 'title')?.key ||
                '_id';

            const config: CollectionConfig = {
                collectionId,
                visible: false,
                pathPrefix: `/${collectionId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                slugField,
                components: {},
            };

            if (references.length > 0) {
                config.references = references;
            }

            collectionConfigs.push(config);
        });

        console.log(
            `[wix-data] Generated config for ${collectionConfigs.length} collections (all hidden by default)`,
        );

        return {
            config: { collections: collectionConfigs },
            collectionData,
        };
    } catch (error) {
        console.error('[wix-data] Failed to fetch collections from Wix Data API:', error);
        return {
            config: { collections: [] },
            collectionData: [],
        };
    }
}

/**
 * Save documentation markdown file with collection info and relationship diagram
 */
async function saveDocumentation(
    collectionData: CollectionDocData[],
    docsPath: string,
): Promise<void> {
    if (collectionData.length === 0) {
        return;
    }

    try {
        const markdown = generateDocumentationMarkdown(collectionData);
        fs.writeFileSync(docsPath, markdown, 'utf-8');
        console.log(`[wix-data] Saved collection documentation to ${docsPath}`);
    } catch (error) {
        console.error('[wix-data] Failed to save documentation file:', error);
    }
}

/**
 * Generate markdown documentation for collections
 */
function generateDocumentationMarkdown(collectionData: CollectionDocData[]): string {
    const sections: string[] = [];

    // Header
    sections.push(`# Wix Data Collections

This document was auto-generated from your Wix Data collections.
It provides an overview of your data model and relationships.

Generated: ${new Date().toISOString()}

---
`);

    // Collection summary table
    sections.push(`## Collections Overview

| Collection | Display Name | Fields | References |
|------------|--------------|--------|------------|
${collectionData
    .map((c) => `| ${c.id} | ${c.displayName} | ${c.fields.length} | ${c.references.length} |`)
    .join('\n')}

---
`);

    // Mermaid flowchart diagram
    sections.push(`## Relationships Diagram

\`\`\`mermaid
flowchart LR
${generateMermaidDiagram(collectionData)}
\`\`\`

---
`);

    // Detailed collection info
    sections.push(`## Collection Details
`);

    collectionData.forEach((collection) => {
        sections.push(`### ${collection.displayName} (\`${collection.id}\`)

**Fields:**

| Field | Display Name | Type |
|-------|--------------|------|
${collection.fields.map((f) => `| ${f.key} | ${f.displayName} | ${f.type} |`).join('\n')}
`);

        if (collection.references.length > 0) {
            sections.push(`
**References:**

| Field | Target Collection | Type |
|-------|-------------------|------|
${collection.references
    .map(
        (r) =>
            `| ${r.fieldName} (${r.fieldDisplayName}) | ${r.targetCollection} | ${r.isMulti ? 'Multi-Reference' : 'Reference'} |`,
    )
    .join('\n')}
`);
        }

        sections.push(`
---
`);
    });

    return sections.join('\n');
}

/**
 * Generate Mermaid flowchart content for collection relationships
 */
function generateMermaidDiagram(collectionData: CollectionDocData[]): string {
    const lines: string[] = [];
    const collectionIds = new Set(collectionData.map((c) => c.id));

    // Define nodes (collections) with display names
    collectionData.forEach((collection) => {
        const nodeId = sanitizeMermaidId(collection.id);
        const label = sanitizeMermaidLabel(collection.displayName || collection.id);
        lines.push(`    ${nodeId}["${label}"]`);
    });

    lines.push('');

    // Add relationships as edges
    collectionData.forEach((collection) => {
        const sourceId = sanitizeMermaidId(collection.id);

        collection.references.forEach((ref) => {
            // Only add relationship if target collection exists in our data
            if (collectionIds.has(ref.targetCollection)) {
                const targetId = sanitizeMermaidId(ref.targetCollection);
                const arrow = ref.isMulti ? '-->|*|' : '-->|1|';
                const label = ref.fieldDisplayName || ref.fieldName;
                lines.push(`    ${sourceId} ${arrow} ${targetId}`);
                lines.push(
                    `    linkStyle ${lines.filter((l) => l.includes('-->')).length - 1} stroke:#666`,
                );
            }
        });
    });

    // Remove linkStyle lines and simplify
    const filteredLines = lines.filter((l) => !l.includes('linkStyle'));

    return filteredLines.join('\n');
}

/**
 * Sanitize ID for use in Mermaid diagrams (node identifiers)
 */
function sanitizeMermaidId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Sanitize label text for Mermaid diagrams (displayed text)
 * Escapes characters that break Mermaid syntax
 */
function sanitizeMermaidLabel(label: string): string {
    return label
        .replace(/"/g, "'") // Replace double quotes with single
        .replace(/\[/g, '(') // Replace brackets that conflict with node syntax
        .replace(/\]/g, ')')
        .replace(/[{}]/g, '') // Remove braces
        .replace(/[<>]/g, ''); // Remove angle brackets
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
    config.collections.forEach((collection) => {
        if (seenIds.has(collection.collectionId)) {
            errors.push(`Duplicate collectionId: ${collection.collectionId}`);
        }
        seenIds.add(collection.collectionId);

        // Validate each collection
        const collectionErrors = validateCollectionConfig(collection);
        errors.push(...collectionErrors.map((e) => `${collection.collectionId}: ${e}`));
    });

    // Check for duplicate path prefixes (only for visible collections)
    const seenPaths = new Set<string>();
    config.collections
        .filter((c) => c.visible)
        .forEach((collection) => {
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
    return config.collections.filter((c) => c.visible === true);
}

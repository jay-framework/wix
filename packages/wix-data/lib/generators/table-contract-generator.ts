/**
 * Table Contract Generator
 * 
 * Generates contracts for table widgets from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { schemaToContractYaml, toPascalCase } from '../utils/schema-to-contract';
import { CollectionSchema } from '../config/config-types';

/**
 * Generator for table widget contracts.
 * Creates one contract per collection that has tableWidget: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const config = wixDataService.config;
        const contracts: { name: string; yaml: string; description?: string }[] = [];
        
        for (const collectionConfig of config.collections) {
            // Skip collections without tableWidget enabled
            if (!collectionConfig.components.tableWidget) continue;
            
            try {
                // Fetch collection schema from Wix Data API
                const schemaResponse = await wixDataService.collections.getDataCollection(
                    collectionConfig.collectionId
                );
                
                if (!schemaResponse.collection) {
                    console.warn(`[wix-data] Collection not found: ${collectionConfig.collectionId}`);
                    continue;
                }
                
                // Convert API response to our schema type
                const schema: CollectionSchema = {
                    _id: schemaResponse.collection._id || collectionConfig.collectionId,
                    displayName: schemaResponse.collection.displayName,
                    fields: (schemaResponse.collection.fields || []).map(f => ({
                        key: f.key || '',
                        displayName: f.displayName,
                        type: f.type as any || 'TEXT',
                        required: f.required
                    }))
                };
                
                // Generate contract YAML from schema
                const yaml = schemaToContractYaml(schema, {
                    type: 'table',
                });
                
                const contractName = toPascalCase(collectionConfig.collectionId) + 'Table';
                
                contracts.push({
                    name: contractName,
                    yaml,
                    description: `Table widget for ${schema.displayName || collectionConfig.collectionId}`
                });
                
                console.log(`[wix-data] Generated table contract: ${contractName}`);
                
            } catch (error) {
                console.error(`[wix-data] Failed to generate table contract for ${collectionConfig.collectionId}:`, error);
            }
        }
        
        return contracts;
    });

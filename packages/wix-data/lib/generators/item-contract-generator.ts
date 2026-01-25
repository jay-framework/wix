/**
 * Item Contract Generator
 * 
 * Generates contracts for item pages from Wix Data collection schemas.
 * Uses makeContractGenerator pattern for dynamic contract generation.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { schemaToContractYaml, toPascalCase } from '../utils/schema-to-contract';
import { fetchCollectionSchema, ContractDefinition } from '../utils/schema-fetcher';

/**
 * Generator for item page contracts.
 * Creates one contract per collection that has itemPage: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const collectionsWithItemPage = wixDataService.config.collections
            .filter(c => c.components.itemPage);
        
        const schemaResults = await Promise.all(
            collectionsWithItemPage.map(c => fetchCollectionSchema(wixDataService, c))
        );
        
        const contracts: ContractDefinition[] = schemaResults
            .filter((result): result is NonNullable<typeof result> => result !== null)
            .map(({ collectionConfig, schema }) => {
                const yaml = schemaToContractYaml(schema, {
                    type: 'item',
                    embedReferences: collectionConfig.references?.filter(r => r.mode === 'embed'),
                });
                
                const contractName = toPascalCase(collectionConfig.collectionId) + 'Item';
                console.log(`[wix-data] Generated item contract: ${contractName}`);
                
                return {
                    name: contractName,
                    yaml,
                    description: `Item page for ${schema.displayName || collectionConfig.collectionId}`
                };
            });
        
        return contracts;
    });

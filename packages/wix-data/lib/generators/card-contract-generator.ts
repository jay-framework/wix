/**
 * Card Contract Generator
 * 
 * Generates contracts for card widgets from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { schemaToContractYaml, toPascalCase } from '../utils/schema-to-contract';
import { fetchCollectionSchema, ContractDefinition } from '../utils/schema-fetcher';

/**
 * Generator for card widget contracts.
 * Creates one contract per collection that has cardWidget: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const collectionsWithCard = wixDataService.config.collections
            .filter(c => c.components.cardWidget);
        
        const schemaResults = await Promise.all(
            collectionsWithCard.map(c => fetchCollectionSchema(wixDataService, c))
        );
        
        const contracts: ContractDefinition[] = schemaResults
            .filter((result): result is NonNullable<typeof result> => result !== null)
            .map(({ collectionConfig, schema }) => {
                const yaml = schemaToContractYaml(schema, {
                    type: 'card',
                });
                
                const contractName = toPascalCase(collectionConfig.collectionId) + 'Card';
                console.log(`[wix-data] Generated card contract: ${contractName}`);
                
                return {
                    name: contractName,
                    yaml,
                    description: `Card widget for ${schema.displayName || collectionConfig.collectionId}`
                };
            });
        
        return contracts;
    });

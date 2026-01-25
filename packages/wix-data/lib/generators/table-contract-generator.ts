/**
 * Table Contract Generator
 * 
 * Generates contracts for table widgets from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { schemaToContractYaml, toPascalCase } from '../utils/schema-to-contract';
import { fetchCollectionSchema, ContractDefinition } from '../utils/schema-fetcher';

/**
 * Generator for table widget contracts.
 * Creates one contract per collection that has tableWidget: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const collectionsWithTable = wixDataService.config.collections
            .filter(c => c.components.tableWidget);
        
        const schemaResults = await Promise.all(
            collectionsWithTable.map(c => fetchCollectionSchema(wixDataService, c))
        );
        
        const contracts: ContractDefinition[] = schemaResults
            .filter((result): result is NonNullable<typeof result> => result !== null)
            .map(({ collectionConfig, schema }) => {
                const yaml = schemaToContractYaml(schema, {
                    type: 'table',
                });
                
                const contractName = toPascalCase(collectionConfig.collectionId) + 'Table';
                console.log(`[wix-data] Generated table contract: ${contractName}`);
                
                return {
                    name: contractName,
                    yaml,
                    description: `Table widget for ${schema.displayName || collectionConfig.collectionId}`
                };
            });
        
        return contracts;
    });

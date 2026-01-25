/**
 * List Contract Generator
 * 
 * Generates contracts for list pages (index and category) from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { schemaToContractYaml, toPascalCase } from '../utils/schema-to-contract';
import { fetchCollectionSchema, ContractDefinition } from '../utils/schema-fetcher';

/**
 * Generator for list page contracts.
 * Creates one contract per collection that has indexPage or categoryPage: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const collectionsWithListPage = wixDataService.config.collections
            .filter(c => c.components.indexPage || c.components.categoryPage);
        
        const schemaResults = await Promise.all(
            collectionsWithListPage.map(c => fetchCollectionSchema(wixDataService, c))
        );
        
        const contracts: ContractDefinition[] = schemaResults
            .filter((result): result is NonNullable<typeof result> => result !== null)
            .map(({ collectionConfig, schema }) => {
                const yaml = schemaToContractYaml(schema, {
                    type: 'list',
                    includePagination: true,
                    includeCategory: !!collectionConfig.category,
                });
                
                const contractName = toPascalCase(collectionConfig.collectionId) + 'List';
                console.log(`[wix-data] Generated list contract: ${contractName}`);
                
                return {
                    name: contractName,
                    yaml,
                    description: `List page for ${schema.displayName || collectionConfig.collectionId}`
                };
            });
        
        return contracts;
    });

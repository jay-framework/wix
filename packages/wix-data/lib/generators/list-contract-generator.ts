/**
 * List Contract Generator
 * 
 * Generates contracts for list pages (index and category) from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { ProcessedSchema } from '../utils/processed-schema';
import {
    dataTag,
    interactiveTag,
    variantTag,
    fieldToTag,
    categorySubContract,
    breadcrumbsSubContract,
    toPascalCase
} from './contract-utils';

/**
 * Build items sub-contract for list (card structure)
 */
function buildItemsSubContract(schema: ProcessedSchema): string {
    const cardTags: string[] = [
        dataTag('_id', 'string', undefined, 6),
        dataTag('url', 'string', 'Full URL to item page', 6),
        interactiveTag('itemLink', 'HTMLAnchorElement', undefined, 6)
    ];
    
    schema.cardFields.forEach(f => {
        const tag = fieldToTag(f, 6);
        if (tag) cardTags.push(tag);
    });
    
    return `  - tag: items
    type: sub-contract
    repeated: true
    trackBy: _id
    description: Items in the list
    tags:
${cardTags.join('\n')}`;
}

/**
 * Build list page contract YAML
 */
function buildContract(schema: ProcessedSchema): string {
    const tags: string[] = [];
    
    // Items array using card structure
    tags.push(buildItemsSubContract(schema));
    
    // Pagination
    tags.push(dataTag('totalCount', 'number', 'Total items'));
    tags.push(variantTag('hasMore', 'boolean', 'fast+interactive', 'More items available'));
    tags.push(variantTag('isLoading', 'boolean', 'fast+interactive', 'Loading state'));
    tags.push(interactiveTag('loadMoreButton', 'HTMLButtonElement', 'Load more trigger'));
    
    // Category if configured
    if (schema.hasCategory) {
        tags.push(categorySubContract());
    }
    
    // Breadcrumbs
    tags.push(breadcrumbsSubContract());
    
    return `name: ${toPascalCase(schema.collectionId)}List
description: List page for ${schema.displayName || schema.collectionId}
tags:
${tags.join('\n')}`;
}

/**
 * Generator for list page contracts.
 * Creates one contract per collection that has indexPage or categoryPage: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const schemas = await wixDataService.getProcessedSchemas(
            c => !!c.components.indexPage || !!c.components.categoryPage
        );
        
        return schemas.map(schema => {
            const name = toPascalCase(schema.collectionId) + 'List';
            console.log(`[wix-data] Generated list contract: ${name}`);
            
            return {
                name,
                yaml: buildContract(schema),
                description: `List page for ${schema.displayName || schema.collectionId}`
            };
        });
    });

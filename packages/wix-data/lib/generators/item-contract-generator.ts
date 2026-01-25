/**
 * Item Contract Generator
 * 
 * Generates contracts for item pages from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { ProcessedSchema } from '../utils/processed-schema';
import {
    dataTag,
    interactiveTag,
    fieldToTag,
    categorySubContract,
    breadcrumbsSubContract,
    toPascalCase,
    isContentField
} from './contract-utils';

/**
 * Build item page contract YAML
 */
function buildContract(schema: ProcessedSchema): string {
    const tags: string[] = [
        dataTag('_id', 'string', 'Item ID'),
        interactiveTag('itemLink', 'HTMLAnchorElement', 'Link to item')
    ];
    
    // Add all non-system fields
    schema.fields.filter(isContentField).forEach(f => {
        const tag = fieldToTag(f);
        if (tag) tags.push(tag);
    });
    
    // Add category if configured
    if (schema.hasCategory) {
        tags.push(categorySubContract());
    }
    
    // Add breadcrumbs
    tags.push(breadcrumbsSubContract());
    
    return `name: ${toPascalCase(schema.collectionId)}Item
description: Item page for ${schema.displayName || schema.collectionId}
tags:
${tags.join('\n')}`;
}

/**
 * Generator for item page contracts.
 * Creates one contract per collection that has itemPage: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const schemas = await wixDataService.getProcessedSchemas(
            c => !!c.components.itemPage
        );
        
        return schemas.map(schema => {
            const name = toPascalCase(schema.collectionId) + 'Item';
            console.log(`[wix-data] Generated item contract: ${name}`);
            
            return {
                name,
                yaml: buildContract(schema),
                description: `Item page for ${schema.displayName || schema.collectionId}`
            };
        });
    });

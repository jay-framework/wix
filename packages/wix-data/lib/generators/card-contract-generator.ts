/**
 * Card Contract Generator
 * 
 * Generates contracts for card widgets from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { ProcessedSchema } from '../utils/processed-schema';
import {
    dataTag,
    interactiveTag,
    fieldToTag,
    toPascalCase
} from './contract-utils';

/**
 * Build card widget contract YAML
 */
function buildContract(schema: ProcessedSchema): string {
    const tags: string[] = [
        dataTag('_id', 'string'),
        dataTag('url', 'string', 'Full URL to item page'),
        interactiveTag('itemLink', 'HTMLAnchorElement')
    ];
    
    // Add card-suitable fields
    schema.cardFields.forEach(f => {
        const tag = fieldToTag(f);
        if (tag) tags.push(tag);
    });
    
    return `name: ${toPascalCase(schema.collectionId)}Card
description: Card widget for ${schema.displayName || schema.collectionId}
tags:
${tags.join('\n')}`;
}

/**
 * Generator for card widget contracts.
 * Creates one contract per collection that has cardWidget: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const schemas = await wixDataService.getProcessedSchemas(
            c => !!c.components.cardWidget
        );
        
        return schemas.map(schema => {
            const name = toPascalCase(schema.collectionId) + 'Card';
            console.log(`[wix-data] Generated card contract: ${name}`);
            
            return {
                name,
                yaml: buildContract(schema),
                description: `Card widget for ${schema.displayName || schema.collectionId}`
            };
        });
    });

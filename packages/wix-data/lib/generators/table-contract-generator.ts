/**
 * Table Contract Generator
 * 
 * Generates contracts for table widgets from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { ProcessedSchema } from '../utils/processed-schema';
import {
    dataTag,
    interactiveTag,
    variantTag,
    categorySubContract,
    toPascalCase
} from './contract-utils';

/**
 * Build table widget contract YAML
 */
function buildContract(schema: ProcessedSchema): string {
    const tags: string[] = [];
    
    // Column definitions
    tags.push(`  - tag: columns
    type: sub-contract
    repeated: true
    trackBy: fieldName
    description: Table column definitions
    tags:
      - {tag: fieldName, type: data, dataType: string}
      - {tag: label, type: data, dataType: string}
      - {tag: sortable, type: variant, dataType: boolean}
      - {tag: sortDirection, type: variant, dataType: "enum (NONE | ASC | DESC)", phase: fast+interactive}
      - {tag: headerButton, type: interactive, elementType: HTMLButtonElement}`);
    
    // Rows with cells
    tags.push(`  - tag: rows
    type: sub-contract
    repeated: true
    trackBy: _id
    description: Table rows
    tags:
      - {tag: _id, type: data, dataType: string}
      - {tag: url, type: data, dataType: string}
      - {tag: rowLink, type: interactive, elementType: HTMLAnchorElement}
      - tag: cells
        type: sub-contract
        repeated: true
        trackBy: fieldName
        tags:
          - {tag: fieldName, type: data, dataType: string}
          - {tag: value, type: data, dataType: string}`);
    
    // Pagination
    tags.push(dataTag('totalCount', 'number'));
    tags.push(dataTag('pageSize', 'number'));
    tags.push(dataTag('totalPages', 'number'));
    tags.push(variantTag('currentPage', 'number', 'fast+interactive'));
    tags.push(variantTag('hasPrev', 'boolean', 'fast+interactive'));
    tags.push(variantTag('hasNext', 'boolean', 'fast+interactive'));
    tags.push(interactiveTag('prevButton', 'HTMLButtonElement'));
    tags.push(interactiveTag('nextButton', 'HTMLButtonElement'));
    
    // Category if configured
    if (schema.hasCategory) {
        tags.push(categorySubContract());
    }
    
    return `name: ${toPascalCase(schema.collectionId)}Table
description: Table widget for ${schema.displayName || schema.collectionId}
tags:
${tags.join('\n')}`;
}

/**
 * Generator for table widget contracts.
 * Creates one contract per collection that has tableWidget: true in config.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const schemas = await wixDataService.getProcessedSchemas(
            c => !!c.components.tableWidget
        );
        
        return schemas.map(schema => {
            const name = toPascalCase(schema.collectionId) + 'Table';
            console.log(`[wix-data] Generated table contract: ${name}`);
            
            return {
                name,
                yaml: buildContract(schema),
                description: `Table widget for ${schema.displayName || schema.collectionId}`
            };
        });
    });

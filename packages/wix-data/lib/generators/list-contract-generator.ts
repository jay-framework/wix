/**
 * List Contract Generator
 *
 * Generates contracts for list pages (index and category) from Wix Data collection schemas.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { ProcessedSchema } from '../utils/processed-schema';
import { getComponentFields, isComponentEnabled, ComponentConfig } from '../types';
import {
    dataTag,
    dataTagWithPhase,
    interactiveTag,
    variantTag,
    fieldToTag,
    categorySubContract,
    breadcrumbsSubContract,
    toPascalCase,
    isCardField,
} from './contract-utils';

/**
 * Get the combined component config for list pages (indexPage or categoryPage).
 * Uses indexPage config if available, otherwise categoryPage.
 */
function getListComponentConfig(schema: ProcessedSchema): ComponentConfig | undefined {
    return schema.config.components.indexPage || schema.config.components.categoryPage;
}

/**
 * Build card tags for items (shared between items and loadedItems)
 * Uses field whitelist if configured, otherwise includes all card-appropriate fields.
 */
function buildCardTags(schema: ProcessedSchema, indent = 6): string[] {
    const componentConfig = getListComponentConfig(schema);
    const whitelist = getComponentFields(componentConfig);

    const cardTags: string[] = [
        dataTag('_id', 'string', undefined, indent),
        dataTag('url', 'string', 'Full URL to item page', indent),
        interactiveTag('itemLink', 'HTMLAnchorElement', undefined, indent),
    ];

    // Determine which fields to include
    const fieldsToInclude = whitelist
        ? schema.fields.filter((f) => whitelist.includes(f.key))
        : schema.fields.filter(isCardField);

    // Add each field with its original name
    fieldsToInclude.forEach((field) => {
        const tag = fieldToTag(field, indent);
        if (tag) cardTags.push(tag);
    });

    return cardTags;
}

/**
 * Build items sub-contract for list (card structure)
 * @param tagName - Name of the tag (items or loadedItems)
 * @param phase - Optional phase (undefined = slow, 'fast+interactive' for loaded items)
 * @param description - Description for the tag
 */
function buildItemsSubContract(
    schema: ProcessedSchema,
    tagName: string,
    phase?: string,
    description?: string,
): string {
    const cardTags = buildCardTags(schema);
    const phaseAttr = phase ? `\n    phase: ${phase}` : '';
    const desc =
        description ||
        (phase ? 'Additional items loaded on the client' : 'Initial items (rendered server-side)');

    return `  - tag: ${tagName}
    type: sub-contract
    repeated: true
    trackBy: _id${phaseAttr}
    description: ${desc}
    tags:
${cardTags.join('\n')}`;
}

/**
 * Build list page contract YAML
 *
 * Pattern follows wix-stores category-page:
 * - items: First page rendered in slow phase (build time)
 * - loadedItems: Additional items loaded via "load more" (fast+interactive)
 */
function buildContract(schema: ProcessedSchema): string {
    const tags: string[] = [];

    // Initial items (slow phase - build time)
    tags.push(buildItemsSubContract(schema, 'items'));

    // Additional items loaded on client (fast+interactive phase)
    tags.push(buildItemsSubContract(schema, 'loadedItems', 'fast+interactive'));

    // Metadata (slow phase)
    tags.push(dataTag('totalCount', 'number', 'Total items'));

    // Load more state (fast+interactive)
    tags.push(variantTag('hasMore', 'boolean', 'fast+interactive', 'More items available'));
    tags.push(variantTag('isLoading', 'boolean', 'fast+interactive', 'Loading state'));
    tags.push(
        dataTagWithPhase('loadedCount', 'number', 'fast+interactive', 'Items currently loaded'),
    );
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
 * Creates one contract per visible collection that has indexPage or categoryPage enabled.
 */
export const generator = makeContractGenerator()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .generateWith(async (wixDataService) => {
        const schemas = await wixDataService.getProcessedSchemas(
            (c) =>
                c.visible === true &&
                (isComponentEnabled(c.components.indexPage) ||
                    isComponentEnabled(c.components.categoryPage)),
        );

        return schemas.map((schema) => {
            const name = toPascalCase(schema.collectionId) + 'List';
            console.log(`[wix-data] Generated list contract: ${name}`);

            return {
                name,
                yaml: buildContract(schema),
                description: `List page for ${schema.displayName || schema.collectionId}`,
                metadata: { collectionId: schema.collectionId },
            };
        });
    });

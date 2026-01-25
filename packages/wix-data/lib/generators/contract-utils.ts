/**
 * Contract Generation Utilities
 * 
 * Shared building blocks for contract YAML generation.
 */

import { ProcessedField } from '../utils/processed-schema';

// ============================================================================
// Tag Builders
// ============================================================================

export function dataTag(key: string, type: string, description?: string, indent = 2): string {
    const prefix = ' '.repeat(indent);
    const desc = description ? `, description: ${description}` : '';
    return `${prefix}- {tag: ${key}, type: data, dataType: ${type}${desc}}`;
}

export function interactiveTag(key: string, elementType: string, description?: string, indent = 2): string {
    const prefix = ' '.repeat(indent);
    const desc = description ? `, description: ${description}` : '';
    return `${prefix}- {tag: ${key}, type: interactive, elementType: ${elementType}${desc}}`;
}

export function variantTag(key: string, type: string, phase: string, description?: string, indent = 2): string {
    const prefix = ' '.repeat(indent);
    const desc = description ? `, description: ${description}` : '';
    return `${prefix}- {tag: ${key}, type: variant, dataType: ${type}, phase: ${phase}${desc}}`;
}

// ============================================================================
// Sub-contract Builders
// ============================================================================

export function imageSubContract(key: string, description?: string, indent = 2): string {
    const prefix = ' '.repeat(indent);
    const innerPrefix = ' '.repeat(indent + 2);
    return `${prefix}- tag: ${key}
${prefix}  type: sub-contract
${prefix}  description: ${description || key}
${prefix}  tags:
${innerPrefix}- {tag: url, type: data, dataType: string}
${innerPrefix}- {tag: altText, type: data, dataType: string}
${innerPrefix}- {tag: width, type: data, dataType: number}
${innerPrefix}- {tag: height, type: data, dataType: number}`;
}

export function mediaSubContract(key: string, description?: string, indent = 2): string {
    const prefix = ' '.repeat(indent);
    const innerPrefix = ' '.repeat(indent + 2);
    return `${prefix}- tag: ${key}
${prefix}  type: sub-contract
${prefix}  description: ${description || key}
${prefix}  tags:
${innerPrefix}- {tag: url, type: data, dataType: string}
${innerPrefix}- {tag: title, type: data, dataType: string}`;
}

export function addressSubContract(key: string, description?: string, indent = 2): string {
    const prefix = ' '.repeat(indent);
    const innerPrefix = ' '.repeat(indent + 2);
    return `${prefix}- tag: ${key}
${prefix}  type: sub-contract
${prefix}  description: ${description || key}
${prefix}  tags:
${innerPrefix}- {tag: formatted, type: data, dataType: string}
${innerPrefix}- {tag: city, type: data, dataType: string}
${innerPrefix}- {tag: country, type: data, dataType: string}`;
}

export function referenceSubContract(field: ProcessedField, indent = 2): string {
    const prefix = ' '.repeat(indent);
    const innerPrefix = ' '.repeat(indent + 2);
    const repeated = field.category === 'multiReference' ? `\n${prefix}  repeated: true\n${prefix}  trackBy: _id` : '';
    
    return `${prefix}- tag: ${field.key}
${prefix}  type: sub-contract${repeated}
${prefix}  description: ${field.displayName || field.key}
${prefix}  tags:
${innerPrefix}- {tag: _id, type: data, dataType: string}
${innerPrefix}- {tag: title, type: data, dataType: string}
${innerPrefix}- {tag: slug, type: data, dataType: string}`;
}

export function categorySubContract(indent = 2): string {
    const prefix = ' '.repeat(indent);
    const innerPrefix = ' '.repeat(indent + 2);
    return `${prefix}- tag: category
${prefix}  type: sub-contract
${prefix}  description: Current category
${prefix}  tags:
${innerPrefix}- {tag: _id, type: data, dataType: string}
${innerPrefix}- {tag: slug, type: data, dataType: string}
${innerPrefix}- {tag: title, type: data, dataType: string}
${innerPrefix}- {tag: description, type: data, dataType: string}
${innerPrefix}- {tag: categoryLink, type: interactive, elementType: HTMLAnchorElement}`;
}

export function breadcrumbsSubContract(indent = 2): string {
    const prefix = ' '.repeat(indent);
    const innerPrefix = ' '.repeat(indent + 2);
    return `${prefix}- tag: breadcrumbs
${prefix}  type: sub-contract
${prefix}  repeated: true
${prefix}  trackBy: slug
${prefix}  description: Navigation breadcrumbs
${prefix}  tags:
${innerPrefix}- {tag: slug, type: data, dataType: string}
${innerPrefix}- {tag: title, type: data, dataType: string}
${innerPrefix}- {tag: url, type: data, dataType: string}
${innerPrefix}- {tag: link, type: interactive, elementType: HTMLAnchorElement}`;
}

// ============================================================================
// Field to Tag Conversion
// ============================================================================

export function fieldToTag(field: ProcessedField, indent = 2): string {
    switch (field.category) {
        case 'system':
            return field.key === '_id' ? dataTag('_id', 'string', 'Item ID', indent) : '';
        case 'image':
            return imageSubContract(field.key, field.displayName, indent);
        case 'media':
            return mediaSubContract(field.key, field.displayName, indent);
        case 'address':
            return addressSubContract(field.key, field.displayName, indent);
        case 'reference':
        case 'multiReference':
            return field.embedded 
                ? referenceSubContract(field, indent)
                : dataTag(field.key, 'string', `Reference ID${field.category === 'multiReference' ? 's' : ''}`, indent);
        case 'richContent':
            return dataTag(field.key, 'string', field.displayName, indent);
        default:
            return dataTag(field.key, field.jayType, field.displayName, indent);
    }
}

// ============================================================================
// Helpers
// ============================================================================

export function toPascalCase(str: string): string {
    return str
        .split(/[-_\s]+/)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join('');
}

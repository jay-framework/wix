/**
 * Data Extension Schema → Contract Tag Utilities
 *
 * Converts Wix Data Extension JSON Schema properties to jay-contract YAML tags.
 * Used to materialize the product-page contract with site-specific custom fields.
 *
 * Design Log #16
 */

// ============================================================================
// Types
// ============================================================================

/** A single property from the JSON Schema returned by listDataExtensionSchemas */
export interface JsonSchemaProperty {
    type: string;
    items?: JsonSchemaProperty & { properties?: Record<string, JsonSchemaProperty> };
    properties?: Record<string, JsonSchemaProperty>;
    maxLength?: number;
    maxItems?: number;
    /** Wix extension metadata — ignored for contract generation */
    'x-wix-permissions'?: unknown;
    'x-wix-created-date'?: string;
    'x-wix-filterable'?: boolean;
}

/** Schema returned by listDataExtensionSchemas for a single namespace */
export interface DataExtensionSchema {
    fqdn?: string | null;
    namespace?: string | null;
    jsonSchema?: {
        properties?: Record<string, JsonSchemaProperty>;
        additionalProperties?: boolean;
    } | null;
    _id?: string | null;
    revision?: string | null;
}

// ============================================================================
// JSON Schema Type → Contract DataType
// ============================================================================

function jsonTypeToContractType(type: string): string {
    switch (type) {
        case 'boolean':
            return 'boolean';
        case 'number':
        case 'integer':
            return 'number';
        default:
            return 'string';
    }
}

// ============================================================================
// Tag Builders (matching wix-data contract-utils pattern)
// ============================================================================

function dataTag(key: string, type: string, indent: number): string {
    const prefix = ' '.repeat(indent);
    return `${prefix}- {tag: ${key}, type: data, dataType: ${type}}`;
}

function primitiveArraySubContract(key: string, itemType: string, indent: number): string {
    const prefix = ' '.repeat(indent);
    const innerIndent = indent + 2;
    const indexTag = dataTag('_index', 'number', innerIndent);
    const valueTag = dataTag('value', jsonTypeToContractType(itemType), innerIndent);
    return `${prefix}- tag: ${key}
${prefix}  type: sub-contract
${prefix}  repeated: true
${prefix}  trackBy: _index
${prefix}  description: ${key}
${prefix}  tags:
${indexTag}
${valueTag}`;
}

function objectSubContract(
    key: string,
    properties: Record<string, JsonSchemaProperty>,
    repeated: boolean,
    indent: number,
): string {
    const prefix = ' '.repeat(indent);
    const innerTags = jsonSchemaToContractTags(properties, indent + 2);

    if (repeated) {
        const indexTag = dataTag('_index', 'number', indent + 2);
        return `${prefix}- tag: ${key}
${prefix}  type: sub-contract
${prefix}  repeated: true
${prefix}  trackBy: _index
${prefix}  description: ${key}
${prefix}  tags:
${indexTag}
${innerTags.join('\n')}`;
    }

    return `${prefix}- tag: ${key}
${prefix}  type: sub-contract
${prefix}  description: ${key}
${prefix}  tags:
${innerTags.join('\n')}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Convert JSON Schema properties to jay-contract YAML tag strings.
 *
 * Handles:
 * - string/boolean/number → data tag
 * - array of primitives → repeated sub-contract with _index + value tags
 * - array of objects → repeated sub-contract with nested tags
 * - object → sub-contract with nested tags
 */
export function jsonSchemaToContractTags(
    properties: Record<string, JsonSchemaProperty>,
    indent = 4,
): string[] {
    const tags: string[] = [];

    for (const [key, prop] of Object.entries(properties)) {
        switch (prop.type) {
            case 'string':
            case 'boolean':
            case 'number':
            case 'integer':
                tags.push(dataTag(key, jsonTypeToContractType(prop.type), indent));
                break;

            case 'array': {
                const items = prop.items;
                if (!items) {
                    // Unknown array shape — treat as string
                    tags.push(dataTag(key, 'string', indent));
                } else if (items.type === 'object' && items.properties) {
                    // Array of objects → repeated sub-contract
                    tags.push(objectSubContract(key, items.properties, true, indent));
                } else {
                    // Array of primitives → repeated sub-contract with _index + value
                    tags.push(primitiveArraySubContract(key, items.type || 'string', indent));
                }
                break;
            }

            case 'object':
                if (prop.properties) {
                    tags.push(objectSubContract(key, prop.properties, false, indent));
                } else {
                    tags.push(dataTag(key, 'string', indent));
                }
                break;

            default:
                tags.push(dataTag(key, 'string', indent));
                break;
        }
    }

    return tags;
}

/**
 * Build an `extendedFields` sub-contract YAML block from data extension schemas.
 * Returns null if there are no user-defined fields.
 */
export function buildExtendedFieldsSubContract(
    schemas: DataExtensionSchema[],
    indent = 2,
): string | null {
    // Find the _user_fields namespace schema
    const userFieldsSchema = schemas.find((s) => s.namespace === '_user_fields');
    const properties = userFieldsSchema?.jsonSchema?.properties;

    if (!properties || Object.keys(properties).length === 0) {
        return null;
    }

    const prefix = ' '.repeat(indent);
    const innerTags = jsonSchemaToContractTags(properties, indent + 2);

    return `${prefix}- tag: extendedFields
${prefix}  type: sub-contract
${prefix}  description: Custom product fields from data extension schema
${prefix}  tags:
${innerTags.join('\n')}`;
}

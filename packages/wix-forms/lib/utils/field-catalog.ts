import type { FormFieldView } from '../types.js';

export interface FieldCatalogRow {
    target: string;
    label: string;
    inputType: string;
    required: boolean;
    hasOptions: boolean;
}

export function toFieldCatalogRows(fields: FormFieldView[]): FieldCatalogRow[] {
    return fields.map((field) => ({
        target: field.target,
        label: field.label,
        inputType: field.inputType,
        required: field.required,
        hasOptions: field.options.length > 0,
    }));
}

function quoteYaml(value: string): string {
    if (/^[a-zA-Z0-9_-]+$/.test(value)) {
        return value;
    }
    return JSON.stringify(value);
}

export function buildFieldCatalogEnum(targets: string[]): string {
    if (!targets.length) {
        return 'string';
    }
    return `enum (${targets.map(quoteYaml).join(' | ')})`;
}

export function buildFieldCatalogRowsYaml(rows: FieldCatalogRow[]): string {
    if (!rows.length) {
        return '    rows: []';
    }

    const lines = rows.map((row) => {
        const parts = [
            `target: ${quoteYaml(row.target)}`,
            `label: ${quoteYaml(row.label)}`,
            `inputType: ${quoteYaml(row.inputType)}`,
            `required: ${row.required}`,
            `hasOptions: ${row.hasOptions}`,
        ];
        return `      - { ${parts.join(', ')} }`;
    });

    return `    rows:\n${lines.join('\n')}`;
}

export function buildFieldCatalogBlock(rows: FieldCatalogRow[]): string {
    const targets = rows.map((row) => row.target);
    const targetEnum = buildFieldCatalogEnum(targets);
    const rowsYaml = buildFieldCatalogRowsYaml(rows);

    return `  - tag: fieldCatalog
    type: sub-contract
    repeated: true
    trackBy: target
    phase: slow
    description: Materialized field targets for validate and agent discovery
    tags:
      - { tag: target, type: data, dataType: "${targetEnum}" }
      - { tag: label, type: data, dataType: string }
      - { tag: inputType, type: data, dataType: string }
      - { tag: required, type: data, dataType: boolean }
      - { tag: hasOptions, type: variant, dataType: boolean }
${rowsYaml}`;
}

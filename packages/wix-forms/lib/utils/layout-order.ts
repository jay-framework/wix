import type { RawForm, RawFormField } from '../wix-apis/get-form.js';

/**
 * `formFields[]` in `steps[0].layout.large.items` order (row, then column). Layout items for
 * ids outside `formFields[]` are skipped; fields without a layout item come last.
 */
export function inLayoutOrder(rawForm: Pick<RawForm, 'formFields' | 'steps'>): RawFormField[] {
    const fields = rawForm.formFields ?? [];
    const items = [...(rawForm.steps?.[0]?.layout?.large?.items ?? [])].sort(
        (first, second) =>
            (first.row ?? 0) - (second.row ?? 0) || (first.column ?? 0) - (second.column ?? 0),
    );
    const byId = new Map(fields.map((field) => [field.id, field]));
    const placed = new Set(items.flatMap((item) => byId.get(item.fieldId) ?? []));
    return [...placed, ...fields.filter((field) => !placed.has(field))];
}

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { projectFormFields } from '../lib/utils/project-form-fields.js';

const richTextLabelForm = JSON.parse(
    readFileSync(new URL('./fixtures/rich-text-label-form.json', import.meta.url), 'utf8'),
);

/**
 * Bug: a form field whose schema label is rich content (a Ricos document) renders as `[object Object]`.
 * Found in: live testbed form bcd97338-e680-43bf-9f64-e88b45ae1155 ("Your message" field).
 * Expected: the contract `label` is the plain text of the rich content ("Your message").
 * Actual: the Ricos object is passed through as the label and stringifies to `[object Object]`.
 */
describe('projectFormFields with rich-text labels', () => {
    it('should extract plain text from a rich-content field label', () => {
        const labels = projectFormFields(richTextLabelForm).map((field) => field.label);

        expect(labels).toEqual(['First name', 'Your message']);
    });
});

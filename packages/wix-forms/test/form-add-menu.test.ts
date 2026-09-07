// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildFormAddMenuItems } from '../lib/add-menu/form-items.js';

describe('buildFormAddMenuItems', () => {
    it('should build stage-place Add Menu items with form jay-html prompt', () => {
        const items = buildFormAddMenuItems([
            {
                formId: 'abc-123',
                title: 'Get in touch',
                contractName: 'GetInTouchForm',
                contractSlug: 'get-in-touch-form',
            },
        ]);

        expect(items).toHaveLength(1);
        expect(items[0]?.id).toBe('wix-forms:form:abc-123');
        expect(items[0]?.category).toBe('Forms');
        expect(items[0]?.interaction.mode).toBe('stage-place');
        expect(items[0]?.prompt).toEqual(expect.stringContaining('contract="form/get-in-touch-form"'));
        expect(items[0]?.prompt).toEqual(expect.stringContaining('ref="getintouch.submitButton"'));
        expect(items[0]?.prompt).toEqual(expect.stringContaining('forEach="getintouch.fields"'));
    });
});

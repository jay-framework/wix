// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/actions/forms-actions.js', () => ({
    submitForm: vi.fn(),
    getFormSummary: vi.fn(),
}));
vi.mock('@jay-framework/wix-server-client/client', () => ({
    ensureSessionFresh: vi.fn(async () => undefined),
}));

import { wixForm } from '../lib/components/wix-form.js';
import type { WixFormsService } from '../lib/services/wix-forms-service-marker.js';
import type { FormFieldView, UnsupportedFieldView } from '../lib/types.js';

const firstName: FormFieldView = {
    target: 'first_name',
    label: 'First name',
    inputType: 'text',
    required: true,
    placeholder: '',
    options: [],
};

function formsReturning(unsupportedFields: UnsupportedFieldView[]): WixFormsService {
    return {
        getFormFields: async () => ({ fields: [firstName], unsupportedFields }),
    } as unknown as WixFormsService;
}

async function slowRender(forms: WixFormsService) {
    const props = { metadata: { formId: 'form-1' } };
    return (await (wixForm as any).slowlyRender(props, forms)) as {
        rendered: Record<string, unknown>;
        carryForward: { fields: FormFieldView[]; loadError?: string };
    };
}

describe('wixForm slow render with unsupported fields (DL #51 test 4)', () => {
    /**
     * Bug: a required field the site cannot render (an address) was shown as a text input, so the
     *   visitor filled a form whose submission loses or misrepresents that field.
     * Found in: design-log/51 - address and composite form fields.md, Problem 4.
     * Expected: `loadError` names the field and no field renders (fail-closed), as for a load failure.
     */
    it('should set loadError and render no fields when a required field is unsupported', async () => {
        const output = await slowRender(
            formsReturning([
                {
                    target: 'address',
                    label: 'Multi-line address',
                    wixKind: 'ADDRESS/MULTILINE_ADDRESS',
                    required: true,
                },
            ]),
        );

        expect(output.rendered.loadError).toBe(
            'This form has a required field this site cannot show: Multi-line address.',
        );
        expect(output.rendered.firstName).toBeUndefined();
        expect(output.carryForward).toEqual({
            formId: 'form-1',
            fields: [],
            loadError: 'This form has a required field this site cannot show: Multi-line address.',
        });
    });

    it('should render the supported fields when the unsupported field is optional', async () => {
        const output = await slowRender(
            formsReturning([
                {
                    target: 'file_upload_1ffc',
                    label: 'File upload',
                    wixKind: 'WIX_FILE/FILE_UPLOAD',
                    required: false,
                },
            ]),
        );

        expect(output.rendered.loadError).toBe('');
        expect(output.carryForward.fields).toEqual([firstName]);
    });
});

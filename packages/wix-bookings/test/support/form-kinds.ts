/** The live Get Form captures (DL #51 Phase 0), shared with wix-forms' tests in this repo. */

import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import {
    createLearnedAddressFacts,
    parseAddressTemplates,
    type AddressTemplates,
    type LearnedAddressFacts,
    type RawForm,
    type WixFormsService,
} from '@jay-framework/wix-forms';

export type GetFormFixture =
    | 'booking-form'
    | 'default-form'
    | 'contact-form'
    | 'booking-form-all-kinds';

export const ZERO_FORM_ID = '00000000-0000-0000-0000-000000000000';
export const QA_FORM_ID = 'bbb199c4-9f44-46e8-baaa-05e101851965';
export const CONTACT_FORM_ID = '6bf38693-c02a-4802-8dcb-270f7193b3d2';

/** A fresh deep copy on every call, so a test may change it without touching the shared file. */
export function rawFormFixture(name: GetFormFixture): RawForm {
    const url = new URL(
        `../../../wix-forms/test/fixtures/form-kinds/${name}.json`,
        import.meta.url,
    );
    const { form } = JSON.parse(readFileSync(url, 'utf8')) as { form?: RawForm };
    if (!form) throw new Error(`fixture ${name} has no form`);
    return form;
}

/** The live List Form Templates capture (DL #52 Phase A0), parsed. */
export function fixtureTemplates(): AddressTemplates {
    const url = new URL(
        '../../../wix-forms/test/fixtures/address/templates-list-response.json',
        import.meta.url,
    );
    return parseAddressTemplates(JSON.parse(readFileSync(url, 'utf8')));
}

export type FakeFormsService = WixFormsService & {
    getRawForm: ReturnType<typeof vi.fn>;
    addressTemplates: ReturnType<typeof vi.fn>;
};

/**
 * A forms service whose `getRawForm` returns `form` (or runs `getRawForm`), with the fixture
 * templates and its own learned-facts store (DL #52).
 */
export function formsReturning(
    form: RawForm | ((formId: string) => Promise<RawForm>),
    facts: LearnedAddressFacts = createLearnedAddressFacts(),
): FakeFormsService {
    const getRawForm = vi.fn(typeof form === 'function' ? form : async () => form);
    const addressTemplates = vi.fn(async () => fixtureTemplates());
    return {
        getRawForm,
        addressTemplates,
        learnedAddressFacts: () => facts,
        config: { namespace: 'wix.form_app.form', formIds: [], include: 'enabled' },
    } as unknown as FakeFormsService;
}

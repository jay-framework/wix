/** The live Get Form captures (DL #51 Phase 0), shared with wix-forms' tests in this repo. */

import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import type { RawForm, WixFormsService } from '@jay-framework/wix-forms';

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

/** A forms service whose `getRawForm` returns `form` (or runs `getRawForm`). */
export function formsReturning(
    form: RawForm | ((formId: string) => Promise<RawForm>),
): WixFormsService & { getRawForm: ReturnType<typeof vi.fn> } {
    const getRawForm = vi.fn(typeof form === 'function' ? form : async () => form);
    return { getRawForm } as unknown as WixFormsService & {
        getRawForm: ReturnType<typeof vi.fn>;
    };
}

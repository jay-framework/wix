/** Loads the live Get Form / Get Form Summary captures in `fixtures/form-kinds/` (DL #51 Phase 0). */

import { readFileSync } from 'node:fs';
import type { GetFormResponse, RawForm, RawFormField } from '../../lib/wix-apis/get-form.js';
import type { GetFormSummaryResponse } from '../../lib/wix-apis/get-form-summary.js';

export type GetFormFixture =
    | 'booking-form'
    | 'default-form'
    | 'contact-form'
    | 'booking-form-all-kinds';

function readFixture<T>(name: string): T {
    const url = new URL(`../fixtures/form-kinds/${name}.json`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')) as T;
}

/** A fresh deep copy on every call, so a test may change it without touching other tests. */
export function rawFormFixture(name: GetFormFixture): RawForm {
    const { form } = readFixture<GetFormResponse>(name);
    if (!form) throw new Error(`fixture ${name} has no form`);
    return form;
}

export function formSummaryFixture(): GetFormSummaryResponse {
    return readFixture<GetFormSummaryResponse>('booking-form-summary');
}

/** The `formFields[]` entry with this target (or, for an untargeted field, this identifier). */
export function fixtureField(name: GetFormFixture, targetOrIdentifier: string): RawFormField {
    const field = (rawFormFixture(name).formFields ?? []).find(
        (entry) =>
            entry.inputOptions?.target === targetOrIdentifier ||
            entry.identifier === targetOrIdentifier,
    );
    if (!field) throw new Error(`fixture ${name} has no field ${targetOrIdentifier}`);
    return field;
}

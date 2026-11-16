// @vitest-environment node

/** DL #52 F5, F5b: the per-form server path for addresses, against the LF0 400 captures. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WixApiError } from '@jay-framework/wix-server-client';
import { runSubmission, type SubmitDeps } from '../../lib/submission/run-submission.js';
import { SubmitFailure } from '../../lib/components/submit-outcome.js';
import { createLearnedAddressFacts } from '../../lib/address/learned-address-facts.js';
import { AddressLayoutsUnavailableError } from '../../lib/address/address-templates.js';
import { withLearnedFacts } from '../../lib/address/address-value.js';
import type { FormFieldView } from '../../lib/types.js';
import { addressFieldView, IT_CODES, probeCase, sentAddress } from '../support/address-fixtures.js';

const FORM_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const PATH = '/form-submission-service/v4/submissions';
const ZW = { country: 'ZW', addressLine: '1 st', city: 'Harare', postalCode: '0000' };

function wix400(caseName: string): WixApiError {
    return new WixApiError(400, PATH, JSON.stringify(probeCase(caseName).body));
}

function required400(path: string): WixApiError {
    const body = structuredClone(probeCase('US missing subdivision').body);
    body.details.validationError.fieldViolations[0].data.errors[0].errorPath = path;
    return new WixApiError(400, PATH, JSON.stringify(body));
}

function depsWith(createSubmission: SubmitDeps['createSubmission']) {
    const facts = createLearnedAddressFacts();
    const base = addressFieldView();
    const addressFieldsOf = vi.fn(
        async (): Promise<FormFieldView[]> => [
            { ...base, address: withLearnedFacts(base.address!, facts.snapshot()) },
        ],
    );
    const deps: SubmitDeps = {
        createSubmission,
        resolveClient: () => ({ session: 'none' }),
        resolveIdentity: async () => ({ caller: undefined, client: undefined }),
        isSubmittableForm: async () => true,
        unsupportedFieldsOf: async () => [],
        addressFieldsOf,
        learnedAddressFacts: facts,
        hook: ({ submit }) => submit(undefined, { as: 'site' }),
    };
    return { deps, facts, addressFieldsOf };
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('F5: runSubmission maps a Wix 400 onto address parts', () => {
    it('IT MI → the part key, the 20 codes, and the country they belong to', async () => {
        const { deps, facts } = depsWith(
            vi.fn().mockRejectedValue(wix400('IT (COMMON_STATE) subdivision MI')),
        );
        const result = await runSubmission(
            {
                formId: FORM_ID,
                values: { address: sentAddress(probeCase('IT (COMMON_STATE) subdivision MI')) },
            },
            deps,
        );
        expect(result).toEqual({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { 'address/subdivision': 'Choose a Region from the list.' },
            fieldOptions: {
                'address/subdivision': IT_CODES.map((code) => ({ value: code, label: code })),
            },
            factsCountry: { address: 'IT' },
        });
        expect(facts.subdivisionsOf('IT')).toEqual(IT_CODES);
    });

    it('validates before Wix: US XX never reaches createSubmission', async () => {
        const createSubmission = vi.fn();
        const { deps } = depsWith(createSubmission);
        const result = await runSubmission(
            { formId: FORM_ID, values: { address: sentAddress(probeCase('US subdivision XX')) } },
            deps,
        );
        expect(result).toEqual({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { 'address/subdivision': 'Choose a State from the list.' },
        });
        expect(createSubmission).not.toHaveBeenCalled();
    });

    it('sends the normalised address (a stray part removed)', async () => {
        const createSubmission = vi.fn(async (..._args: unknown[]) => {});
        const { deps } = depsWith(createSubmission);
        const us = sentAddress(probeCase('US valid'));
        await runSubmission(
            { formId: FORM_ID, values: { address: { ...us, streetName: 'x' } } },
            deps,
        );
        expect(createSubmission.mock.calls[0][1]).toEqual({ address: us });
    });

    it('a template failure → unavailable, with the layouts message', async () => {
        const { deps } = depsWith(vi.fn());
        deps.addressFieldsOf = async () => {
            throw new AddressLayoutsUnavailableError();
        };
        await expect(runSubmission({ formId: FORM_ID, values: {} }, deps)).resolves.toEqual({
            success: false,
            reason: SubmitFailure.UNKNOWN,
            message: 'Could not load the address layouts. Please try again later.',
        });
    });
});

describe('F5b: a revealed part survives the next submit', () => {
    it('ZW REQUIRED subdivision → revealedParts; the next submit sends subdivision HA', async () => {
        const createSubmission = vi
            .fn()
            .mockRejectedValueOnce(required400('address/subdivision'))
            .mockResolvedValue(undefined);
        const { deps, facts } = depsWith(createSubmission);
        const first = await runSubmission({ formId: FORM_ID, values: { address: ZW } }, deps);
        expect(first).toMatchObject({
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { 'address/subdivision': 'State/Region is required.' },
            revealedParts: { address: ['subdivision'] },
            factsCountry: { address: 'ZW' },
        });
        expect(facts.revealedPartsOf('ZW')).toEqual(['subdivision']);

        await expect(
            runSubmission(
                { formId: FORM_ID, values: { address: { ...ZW, subdivision: 'HA' } } },
                deps,
            ),
        ).resolves.toEqual({ success: true });
        expect(createSubmission.mock.calls[1][1].address).toEqual({ ...ZW, subdivision: 'HA' });
    });
});

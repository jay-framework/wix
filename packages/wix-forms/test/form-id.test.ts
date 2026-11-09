import { describe, expect, it } from 'vitest';
import { canonicalFormId, formIdPathSegment } from '../lib/utils/form-id';

const LOWER_GUID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const UPPER_GUID = '3F2A9C1E-5B7D-4E8F-9A0B-1C2D3E4F5A6B';

describe('canonicalFormId (DL#49)', () => {
    it('lowercases an upper-case GUID', () => {
        expect(canonicalFormId(UPPER_GUID)).toBe(LOWER_GUID);
    });

    it('trims a padded GUID', () => {
        expect(canonicalFormId(`  ${UPPER_GUID}\n`)).toBe(LOWER_GUID);
    });

    it.each(['form-1', '', '../x', '%2e%2e', `${LOWER_GUID}\nx`, `${LOWER_GUID}/x`])(
        'returns undefined for the non-GUID string %j',
        (raw) => {
            expect(canonicalFormId(raw)).toBeUndefined();
        },
    );

    it.each([42, { id: LOWER_GUID }, null, undefined])('returns undefined for %j', (raw) => {
        expect(canonicalFormId(raw)).toBeUndefined();
    });
});

describe('formIdPathSegment (DL#49)', () => {
    it('returns the canonical id for a GUID', () => {
        expect(formIdPathSegment(UPPER_GUID)).toBe(LOWER_GUID);
    });

    it.each(['form-1', '../../../members/v1/members?x=1#'])('throws for %j', (formId) => {
        expect(() => formIdPathSegment(formId)).toThrow('Form ID is not a valid Wix form id.');
    });
});

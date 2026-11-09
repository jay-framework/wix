// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ALLOWLIST_LOAD_TIMEOUT_MS,
    ALLOWLIST_RETRY_BACKOFF_MS,
    createSubmittableFormCheck,
    type SubmittableFormsSource,
} from '../lib/services/submittable-forms.js';

const NAMESPACE = 'wix.form_app.form';
const FORM_A = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const FORM_B = '9b8a7c6d-1e2f-4a3b-8c9d-0e1f2a3b4c5d';
const UNKNOWN_FORM = '00000000-0000-4000-8000-000000000000';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
});

function warnings(): string[] {
    return warn.mock.calls.map((call) => String(call[0]));
}

function source(
    listEnabledFormIds: () => Promise<string[]>,
    configuredFormIds: readonly string[] = [],
) {
    const list = vi.fn(listEnabledFormIds);
    const value: SubmittableFormsSource = {
        namespace: NAMESPACE,
        configuredFormIds,
        listEnabledFormIds: list,
    };
    return { source: value, list };
}

describe('createSubmittableFormCheck — configured formIds', () => {
    it('should match configured ids case-insensitively without listing forms', async () => {
        const { source: configured, list } = source(async () => [], [FORM_A.toUpperCase()]);
        const isSubmittable = createSubmittableFormCheck(configured);

        expect([await isSubmittable(FORM_A), await isSubmittable(FORM_B)]).toEqual([true, false]);
        expect(list).not.toHaveBeenCalled();
    });

    it('should drop a non-GUID entry with one warning', async () => {
        const { source: configured } = source(async () => [], [FORM_A, 'contact-us']);
        const isSubmittable = createSubmittableFormCheck(configured);

        expect(await isSubmittable(FORM_A)).toBe(true);
        expect(warnings()).toEqual([
            '[wix-forms] formIds entry "contact-us" is not a form id; it is ignored',
        ]);
    });

    it('should refuse every id when no configured entry is a form id, and never list (Q11)', async () => {
        const { source: configured, list } = source(async () => [FORM_A], ['form-1']);
        const isSubmittable = createSubmittableFormCheck(configured);

        expect([await isSubmittable(FORM_A), await isSubmittable(UNKNOWN_FORM)]).toEqual([
            false,
            false,
        ]);
        expect(list).not.toHaveBeenCalled();
        expect(warnings()).toEqual([
            '[wix-forms] formIds entry "form-1" is not a form id; it is ignored',
            '[wix-forms] formIds has no valid form id: every submission is refused',
        ]);
    });
});

describe('createSubmittableFormCheck — enabled forms of the namespace', () => {
    it('should refuse an id that is not listed', async () => {
        const { source: listed } = source(async () => [FORM_A]);

        expect(await createSubmittableFormCheck(listed)(UNKNOWN_FORM)).toBe(false);
    });

    it('should accept a listed form whose Wix id is upper case', async () => {
        const { source: listed } = source(async () => [FORM_A.toUpperCase()]);

        expect(await createSubmittableFormCheck(listed)(FORM_A)).toBe(true);
    });

    it('should list once for two concurrent first checks', async () => {
        const { source: listed, list } = source(async () => [FORM_A]);
        const isSubmittable = createSubmittableFormCheck(listed);

        const answers = await Promise.all([isSubmittable(FORM_A), isSubmittable(FORM_B)]);

        expect(answers).toEqual([true, false]);
        expect(list).toHaveBeenCalledTimes(1);
    });

    it('should not cache a failed load, and fail closed without listing during the backoff', async () => {
        let fail = true;
        const { source: flaky, list } = source(async () => {
            if (fail) throw new Error('Wix API 503');
            return [FORM_A];
        });
        const isSubmittable = createSubmittableFormCheck(flaky);

        await expect(isSubmittable(FORM_A)).rejects.toThrow('Wix API 503');
        fail = false;
        await vi.advanceTimersByTimeAsync(ALLOWLIST_RETRY_BACKOFF_MS - 1);
        await expect(isSubmittable(FORM_A)).rejects.toThrow('submittable forms are unavailable');
        expect(list).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(await isSubmittable(FORM_A)).toBe(true);
        expect(list).toHaveBeenCalledTimes(2);
    });

    it('should reject a load that does not settle within the timeout, then back off', async () => {
        const { source: hanging, list } = source(() => new Promise<string[]>(() => {}));
        const isSubmittable = createSubmittableFormCheck(hanging);

        const first = isSubmittable(FORM_A);
        const firstRejected = expect(first).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(ALLOWLIST_LOAD_TIMEOUT_MS);
        await firstRejected;

        await expect(isSubmittable(FORM_A)).rejects.toThrow('submittable forms are unavailable');
        expect(list).toHaveBeenCalledTimes(1);
    });

    it('should cache an empty list, refuse every id, and warn once naming the namespace', async () => {
        const { source: empty, list } = source(async () => []);
        const isSubmittable = createSubmittableFormCheck(empty);

        expect([await isSubmittable(FORM_A), await isSubmittable(FORM_B)]).toEqual([false, false]);
        expect(list).toHaveBeenCalledTimes(1);
        expect(warnings()).toEqual([
            `[wix-forms] no enabled forms in namespace "${NAMESPACE}": every submission is refused until restart`,
        ]);
    });

    it("should keep each check's backoff to itself", async () => {
        const { source: failing } = source(async () => {
            throw new Error('Wix API 503');
        });
        const { source: healthy } = source(async () => [FORM_A]);
        const failingCheck = createSubmittableFormCheck(failing);
        const healthyCheck = createSubmittableFormCheck(healthy);

        await expect(failingCheck(FORM_A)).rejects.toThrow();

        expect(await healthyCheck(FORM_A)).toBe(true);
    });
});

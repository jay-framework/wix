// @vitest-environment node

/**
 * DL #52 F4: the per-form component after a located 400 — a learned list or a revealed part
 * reaches the view, the store and the next `submitForm` payload. A DOM-free harness with fake
 * address refs (`refs.<tag>.<part>.input|text`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/actions/forms-actions.js', () => ({
    submitForm: vi.fn(),
    getFormSummary: vi.fn(),
}));
vi.mock('@jay-framework/wix-server-client/client', () => ({
    ensureSessionFresh: vi.fn(async () => undefined),
}));

import { makeJayComponent } from '@jay-framework/component';
import { submitForm } from '../lib/actions/forms-actions.js';
import { wixForm } from '../lib/components/wix-form.js';
import { SubmitFailure } from '../lib/components/submit-outcome.js';
import type { FormFieldView } from '../lib/types.js';
import { addressFieldView, IT_CODES } from './support/address-fixtures.js';
import { layoutOf } from '../lib/address/address-value.js';
import type { AddressFieldSpec } from '../lib/address/address-types.js';

const PARTS = [
    'country',
    'addressLine',
    'addressLine2',
    'streetName',
    'streetNumber',
    'city',
    'subdivision',
    'postalCode',
];

interface Element {
    value: string;
    focus: () => void;
}

function mountAddressForm(field: FormFieldView) {
    const handlers = new Map<string, (event: { event: { target: Element } }) => void>();
    const blurHandlers = new Map<string, () => void>();
    const elements = new Map<string, Element>();
    let submit: (() => void) | undefined;
    let viewState: Record<string, any> = {};
    const statusRenders: string[] = [];
    const element = (key: string) => {
        if (!elements.has(key)) elements.set(key, { value: '', focus: vi.fn() });
        return elements.get(key)!;
    };
    const partRef = (key: string) => ({
        oninput: (handler: any) => handlers.set(key, handler),
        onchange: () => {},
        onblur: (handler: () => void) => blurHandlers.set(key, handler),
        exec$: async (fn: (target: Element) => unknown) => fn(element(key)),
    });
    const address = Object.fromEntries(
        PARTS.map((part) => [
            part,
            part === 'subdivision'
                ? { input: partRef(`${part}.input`), text: partRef(`${part}.text`) }
                : { input: partRef(`${part}.input`) },
        ]),
    );
    const refs = {
        address,
        submitButton: {
            onclick: (handler: any) => {
                submit = () => handler({ event: { target: null, preventDefault: () => {} } });
            },
            exec$: async () => undefined,
        },
    };
    const preRender = () => {
        const render = (initial: Record<string, any>) => {
            viewState = initial;
            return {
                dom: undefined,
                mount: () => {},
                update: (next: Record<string, any>) => {
                    if (next.statusMessage !== viewState.statusMessage) {
                        statusRenders.push(next.statusMessage);
                    }
                    viewState = next;
                },
                unmount: () => {},
            };
        };
        return [refs, render] as const;
    };
    const component = makeJayComponent(preRender as any, (props: any, componentRefs: any) =>
        (wixForm as any).comp(props, componentRefs, {}, { formId: 'f-1', fields: [field] }),
    );
    component({} as any);
    return {
        get viewState() {
            return viewState;
        },
        /** Each rendered change of `statusMessage`, in order. */
        statusRenders,
        type: (part: string, value: string, channel = 'input') => {
            const key = `${part}.${channel}`;
            element(key).value = value;
            handlers.get(key)!({ event: { target: element(key) } });
        },
        leave: (part: string, channel = 'input') => blurHandlers.get(`${part}.${channel}`)!(),
        dom: (part: string, channel = 'input') => element(`${part}.${channel}`).value,
        element: (part: string, channel = 'input') => element(`${part}.${channel}`),
        submit: () => submit!(),
    };
}

async function settle(): Promise<void> {
    for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setTimeout(resolve));
}

function lastValues(): Record<string, any> {
    const calls = vi.mocked(submitForm).mock.calls;
    return (calls[calls.length - 1]![0] as any).values;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('F4: presentSubmitRejection on an address', () => {
    it('IT: the learned list replaces the typed code; 25 reaches submitForm', async () => {
        const form = mountAddressForm(addressFieldView());
        for (const [part, value] of Object.entries({
            country: 'IT',
            addressLine: 'Via Roma 1',
            city: 'Milano',
            postalCode: '20100',
        })) {
            form.type(part, value);
            await settle();
        }
        form.type('subdivision', 'MI', 'text');
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { 'address/subdivision': 'Choose a Region from the list.' },
            fieldOptions: {
                'address/subdivision': IT_CODES.map((code) => ({ value: code, label: code })),
            },
            factsCountry: { address: 'IT' },
        } as never);
        form.submit();
        await settle();

        const subdivision = form.viewState.address.subdivision;
        expect([
            subdivision.listed,
            subdivision.options.length,
            subdivision.value,
            subdivision.error,
        ]).toEqual([true, 20, '', 'Choose a Region from the list.']);
        expect(form.dom('subdivision', 'text')).toBe('');

        vi.mocked(submitForm).mockResolvedValueOnce({ success: true } as never);
        form.type('subdivision', '25');
        await settle();
        form.submit();
        await settle();
        expect(lastValues().address.subdivision).toBe('25');
    });

    it('ZW: a revealed subdivision is shown, and HA reaches submitForm', async () => {
        const form = mountAddressForm(addressFieldView());
        for (const [part, value] of Object.entries({
            country: 'ZW',
            addressLine: '1 st',
            city: 'Harare',
            postalCode: '0000',
        })) {
            form.type(part, value);
            await settle();
        }
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { 'address/subdivision': 'State/Region is required.' },
            revealedParts: { address: ['subdivision'] },
            factsCountry: { address: 'ZW' },
        } as never);
        form.submit();
        await settle();
        expect(form.viewState.address.subdivision.shown).toBe(true);
        expect(form.viewState.address.subdivision.error).toBe('State/Region is required.');

        vi.mocked(submitForm).mockResolvedValueOnce({ success: true } as never);
        form.type('subdivision', 'HA', 'text');
        await settle();
        form.submit();
        await settle();
        expect(lastValues().address).toEqual({
            country: 'ZW',
            addressLine: '1 st',
            city: 'Harare',
            subdivision: 'HA',
            postalCode: '0000',
        });
    });

    it('client validation shows part errors and does not call submitForm', async () => {
        const form = mountAddressForm(addressFieldView());
        form.type('country', 'US');
        await settle();
        form.submit();
        await settle();
        expect(submitForm).not.toHaveBeenCalled();
        expect(form.viewState.address.city.error).toBe('City is required.');
        expect(form.viewState.submitFailure).toBe(SubmitFailure.VALIDATION);
        expect(form.element('addressLine').focus).toHaveBeenCalled();
    });
});

/**
 * Bug: the initial (default) country is in the store and the view state, but never written to
 * the country `<select>`, so the visitor sees "Choose…" (or the first option) above US parts.
 * Found in: DL #52 live QA L6 (bookings; the per-form component has the same reflect gap).
 * Expected: the country select's DOM value is the default country after mount.
 * Actual: the select's value is "".
 */
describe('the default country on load', () => {
    it('writes the initial country to the country select', async () => {
        const field = addressFieldView();
        const form = mountAddressForm({
            ...field,
            address: { ...field.address!, initialCountry: 'US' },
        });
        await settle();
        expect(form.viewState.address.country.value).toBe('US');
        expect(form.dom('country')).toBe('US');
    });
});

/**
 * Bug: leaving an address part with an error shows it but never announces it: `handleAddressBlur`
 * validates without the DL #59 announcer, so VoiceOver hears nothing after the next field's name.
 * Found in: DL #59 merge of main (address blur gap).
 * Expected: leaving a part with an error announces that part's text on the next task, owned by
 * `<target>/<part>`; a fix (typing, country change, the subdivision text/select switch) withdraws
 * it silently; no announcement during a submit.
 * Actual: statusMessage stays '' after an invalid address part leave.
 */
describe('DL #59: address part errors are announced on blur', () => {
    const status = (form: ReturnType<typeof mountAddressForm>) => form.viewState.statusMessage;
    const partError = (form: ReturnType<typeof mountAddressForm>, part: string) =>
        form.viewState.address[part].error;

    function hasPart(spec: AddressFieldSpec, country: string, part: string): boolean {
        return Boolean(layoutOf(spec, country)?.parts.some((shown) => shown.part === part));
    }

    function countryWhere(spec: AddressFieldSpec, test: (code: string) => boolean): string {
        const found = spec.countries.map((option) => option.value).find(test);
        if (!found) throw new Error('no fixture country matches');
        return found;
    }

    /** Types then empties `part`, so it is dirty and fails REQUIRED when left. */
    async function emptyAfterTyping(form: ReturnType<typeof mountAddressForm>, part: string) {
        form.type(part, 'x');
        form.type(part, '');
        await settle();
    }

    async function usFormWithEmptyCity() {
        const form = mountAddressForm(addressFieldView());
        form.type('country', 'US');
        await settle();
        await emptyAfterTyping(form, 'city');
        return form;
    }

    it('(a) announces the left part error on the next task', async () => {
        const form = await usFormWithEmptyCity();

        form.leave('city');
        expect(status(form)).toBe('');
        await settle();

        expect(partError(form, 'city')).toBe('City is required.');
        expect(status(form)).toBe('City is required.');
    });

    it('(b) a repeat leave clears then re-reads the same error', async () => {
        const form = await usFormWithEmptyCity();
        form.leave('city');
        await settle();

        const before = form.statusRenders.length;
        form.leave('city');
        await settle();
        expect(form.statusRenders.slice(before)).toEqual(['', 'City is required.\u00a0']);
    });

    it('(c) fixing the part by typing clears silently', async () => {
        const form = await usFormWithEmptyCity();
        form.leave('city');
        await settle();
        expect(status(form)).toBe('City is required.');

        const before = form.statusRenders.length;
        form.type('city', 'Springfield');
        await settle();
        expect(form.statusRenders.slice(before)).toEqual(['']);
    });

    it('(d) a country change withdraws an owned announcement of a removed part', async () => {
        const spec = addressFieldView().address!;
        const removed = 'addressLine';
        const without = countryWhere(spec, (code) => !hasPart(spec, code, removed));
        const form = mountAddressForm(addressFieldView());
        form.type('country', 'US');
        await settle();
        await emptyAfterTyping(form, removed);
        form.leave(removed);
        await settle();
        expect(status(form)).not.toBe('');

        form.type('country', without);
        await settle();
        expect(status(form)).toBe('');
    });

    it('(d) a country change withdraws a pending announcement of a removed part', async () => {
        const spec = addressFieldView().address!;
        const removed = 'addressLine';
        const without = countryWhere(spec, (code) => !hasPart(spec, code, removed));
        const form = mountAddressForm(addressFieldView());
        form.type('country', 'US');
        await settle();
        await emptyAfterTyping(form, removed);

        form.leave(removed);
        form.type('country', without);
        await settle();
        expect(status(form)).toBe('');
    });

    it('(e) does not announce a part leave during a submit', async () => {
        const form = await usFormWithEmptyCity();
        let finish: (result: unknown) => void = () => {};
        vi.mocked(submitForm).mockImplementationOnce(
            () => new Promise((resolve) => (finish = resolve)) as never,
        );
        for (const [part, value] of Object.entries({
            addressLine: '1 Main St',
            city: 'Springfield',
            subdivision: 'IL',
            postalCode: '62701',
        })) {
            form.type(part, value);
        }
        await settle();
        form.submit();
        await settle();
        expect(form.viewState.isSubmitting).toBe(true);

        await emptyAfterTyping(form, 'city');
        form.leave('city');
        await settle();
        expect(status(form)).toBe('');
        finish({ success: true });
        await settle();
    });

    it('(f) leaving another part valid keeps the first part text', async () => {
        const form = await usFormWithEmptyCity();
        form.leave('city');
        await settle();

        form.type('addressLine', '1 Main St');
        form.leave('addressLine');
        await settle();
        expect(status(form)).toBe('City is required.');
    });

    it('(G2) leaving an untouched part does not complain', async () => {
        const form = mountAddressForm(addressFieldView());
        form.type('country', 'US');
        form.type('addressLine', '1 Main St');
        await settle();

        form.leave('city');
        await settle();
        expect(status(form)).toBe('');
    });

    it('(g) the subdivision text -> select switch withdraws the text owner', async () => {
        const spec = addressFieldView().address!;
        const withSubdivision = (code: string) => hasPart(spec, code, 'subdivision');
        const listed = (code: string) => Boolean(layoutOf(spec, code)?.subdivisions?.length);
        const textCountry = countryWhere(spec, (code) => withSubdivision(code) && !listed(code));
        const listCountry = countryWhere(spec, (code) => withSubdivision(code) && listed(code));
        const form = mountAddressForm(addressFieldView());
        form.type('country', textCountry);
        await settle();
        expect(form.viewState.address.subdivision.listed).toBe(false);
        form.type('subdivision', 'x', 'text');
        form.type('subdivision', '', 'text');
        await settle();
        form.leave('subdivision', 'text');
        await settle();
        expect(status(form)).not.toBe('');

        form.type('country', listCountry);
        await settle();
        expect(form.viewState.address.subdivision.listed).toBe(true);
        expect(status(form)).toBe('');
    });
});

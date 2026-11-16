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
    const elements = new Map<string, Element>();
    let submit: (() => void) | undefined;
    let viewState: Record<string, any> = {};
    const element = (key: string) => {
        if (!elements.has(key)) elements.set(key, { value: '', focus: vi.fn() });
        return elements.get(key)!;
    };
    const partRef = (key: string) => ({
        oninput: (handler: any) => handlers.set(key, handler),
        onchange: () => {},
        onblur: () => {},
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
        type: (part: string, value: string, channel = 'input') => {
            const key = `${part}.${channel}`;
            element(key).value = value;
            handlers.get(key)!({ event: { target: element(key) } });
        },
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

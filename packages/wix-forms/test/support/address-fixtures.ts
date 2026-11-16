/** Loaders for the DL #52 address fixtures (`fixtures/address/`, captured live 2026-11-16). */

import { readFileSync } from 'node:fs';
import {
    parseAddressTemplates,
    type AddressTemplates,
} from '../../lib/address/address-templates.js';
import { resolveAddressSpec } from '../../lib/address/address-spec.js';
import type {
    AddressConfig,
    AddressFieldSpec,
    AddressSchemaFacts,
    AddressValue,
} from '../../lib/address/address-types.js';
import { readFieldKey } from '../../lib/utils/classify-form-field.js';
import type { FormFieldView } from '../../lib/types.js';
import { fixtureField } from './form-kinds.js';

export function addressFixture<T = any>(name: string): T {
    const url = new URL(`../fixtures/address/${name}`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export function templatesResponse(): { templates: unknown[] } {
    return addressFixture('templates-list-response.json');
}

export function fixtureTemplates(): AddressTemplates {
    return parseAddressTemplates(templatesResponse());
}

export interface ProbeCase {
    case: string;
    sent: Record<string, unknown>;
    status: number;
    body: any;
}

export function probeCase(name: string): ProbeCase {
    const found = addressFixture<{ cases: ProbeCase[] }>(
        'create-submission-address-probe.json',
    ).cases.find((entry) => entry.case === name);
    if (!found) throw new Error(`no probe case "${name}"`);
    return found;
}

export function probeErrors(entry: ProbeCase): Array<{ errorPath: string; errorType: string }> {
    return (entry.body?.details?.validationError?.fieldViolations ?? []).flatMap(
        (violation: any) => violation.data?.errors ?? [],
    );
}

/** The probe form's required, all-countries address: the booking form's facts (all parts required). */
export function requiredAddressFacts(): AddressSchemaFacts {
    return readFieldKey(fixtureField('booking-form', 'address')).address!;
}

/** The probe form's optional `address_limited`: US, IL, IT; default US. */
export function limitedAddressFacts(): AddressSchemaFacts {
    return {
        allowedCountries: ['US', 'IL', 'IT'],
        partRequired: {},
        showAddressLine2: false,
        defaultCountry: { type: 'COUNTRY', country: 'US' },
    };
}

export function specOf(facts: AddressSchemaFacts, config?: AddressConfig): AddressFieldSpec {
    const resolved = resolveAddressSpec(facts, fixtureTemplates(), { config, warn: () => {} });
    if ('unsupported' in resolved) throw new Error(resolved.unsupported);
    return resolved;
}

export function addressFieldView(
    target = 'address',
    facts = requiredAddressFacts(),
    required = true,
): FormFieldView {
    return {
        target,
        label: 'Address',
        inputType: 'address',
        required,
        placeholder: '',
        options: [],
        address: specOf(facts),
    };
}

export function sentAddress(entry: ProbeCase, target = 'address'): AddressValue {
    return entry.sent[target] as AddressValue;
}

export const IT_CODES = [
    '21',
    '23',
    '25',
    '32',
    '34',
    '36',
    '42',
    '45',
    '52',
    '55',
    '57',
    '62',
    '65',
    '67',
    '72',
    '75',
    '77',
    '78',
    '82',
    '88',
];

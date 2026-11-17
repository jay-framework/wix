import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    AddressLayoutsUnavailableError,
    createAddressTemplateSource,
    parseAddressTemplates,
    TEMPLATES_RETRY_BACKOFF_MS,
    TEMPLATES_TTL_MS,
} from '../../lib/address/address-templates.js';
import { ADDRESS_TEMPLATE_IDS } from '../../lib/address/address-countries.js';
import { addressFixture, templatesResponse } from '../support/address-fixtures.js';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const FIXTURE_DIR = new URL('../fixtures/address/', import.meta.url);

/** Ids inside the templates response (template, field, step): public template data. */
function templateInternalIds(): Set<string> {
    const text = readFileSync(new URL('templates-list-response.json', FIXTURE_DIR), 'utf8');
    return new Set(text.match(UUID) ?? []);
}

describe('A0: committed address fixtures carry no private ids', () => {
    it('has no UUID other than the template ids and the templates’ own ids, and no requestId key', () => {
        const allowed = new Set<string>([
            ...Object.values(ADDRESS_TEMPLATE_IDS),
            ...templateInternalIds(),
        ]);
        for (const name of readdirSync(FIXTURE_DIR)) {
            const text = readFileSync(new URL(name, FIXTURE_DIR), 'utf8');
            const foreign = (text.match(UUID) ?? []).filter((id) => !allowed.has(id));
            expect({ name, foreign }).toEqual({ name, foreign: [] });
            expect(text).not.toMatch(/"(requestId|x-wix-request-id|submissionId)"/);
        }
    });

    it('keeps template-internal ids out of every fixture but the templates response', () => {
        const internal = templateInternalIds();
        for (const id of Object.values(ADDRESS_TEMPLATE_IDS)) internal.delete(id);
        for (const name of readdirSync(FIXTURE_DIR).filter(
            (file) => file !== 'templates-list-response.json',
        )) {
            const text = readFileSync(new URL(name, FIXTURE_DIR), 'utf8');
            expect((text.match(UUID) ?? []).filter((id) => internal.has(id))).toEqual([]);
        }
    });
});

describe('A1: parseAddressTemplates', () => {
    const expected = addressFixture('expected-layouts.json');

    it('de-duplicates the response into the 12 ids', () => {
        expect(Object.keys(parseAddressTemplates(templatesResponse())).sort()).toEqual(
            Object.values(ADDRESS_TEMPLATE_IDS).sort(),
        );
    });

    it.each(Object.entries(ADDRESS_TEMPLATE_IDS))(
        '%s: parts, order, required and limits',
        (name, id) => {
            const template = parseAddressTemplates(templatesResponse())[id];
            const fields = template.fields.map(({ enumValues, ...field }) => field);
            expect(fields).toEqual(expected[name].fields);
            const subdivision = template.fields.find((field) => field.part === 'subdivision');
            expect(subdivision?.enumValues.length ?? 0).toBe(expected[name].subdivisionCodeCount);
        },
    );

    it('pins every postalCode pattern to ^.{0,50}$ (the "is too long." message relies on it)', () => {
        const templates = Object.values(parseAddressTemplates(templatesResponse()));
        const patterns = templates.flatMap((template) =>
            template.fields
                .filter((field) => field.part === 'postalCode')
                .map((field) => field.pattern),
        );
        expect(new Set(patterns)).toEqual(new Set(['^.{0,50}$']));
    });

    it('skips a copy whose fields have no target (the live response has one for MLA_FR)', () => {
        const fr = parseAddressTemplates(templatesResponse())[ADDRESS_TEMPLATE_IDS.MLA_FR];
        expect(fr.fields.map((field) => field.part)).toEqual([
            'addressLine',
            'addressLine2',
            'postalCode',
            'city',
            'subdivision',
        ]);
    });

    it('fails on a missing id', () => {
        const response = templatesResponse();
        response.templates = response.templates.filter(
            (template: any) => template.id !== ADDRESS_TEMPLATE_IDS.MLA_JP,
        );
        expect(() => parseAddressTemplates(response)).toThrow(
            `address template ${ADDRESS_TEMPLATE_IDS.MLA_JP} is missing`,
        );
    });

    /** Review round 3, m2: a target outside the eight parts fails the whole response. */
    it('fails on a target that is not one of the eight parts', () => {
        const response = templatesResponse();
        for (const template of response.templates as any[]) {
            if (template.id !== ADDRESS_TEMPLATE_IDS.MLA_US) continue;
            for (const field of template.formFields ?? []) {
                if (field.inputOptions?.target === 'city') field.inputOptions.target = 'district';
            }
        }
        expect(() => parseAddressTemplates(response)).toThrow('unknown part "district"');
    });
});

describe('A8: createAddressTemplateSource', () => {
    function clock(start = 0) {
        let time = start;
        return { now: () => time, set: (value: number) => (time = value) };
    }

    it('shares one fetch between concurrent calls', async () => {
        const fetch = vi.fn(async () => templatesResponse());
        const source = createAddressTemplateSource({ fetch });
        const [first, second] = await Promise.all([source.load(), source.load()]);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(first).toBe(second);
    });

    it('does not cache a failure, and fails fast within the 30 s backoff', async () => {
        const time = clock();
        const fetch = vi
            .fn()
            .mockRejectedValueOnce(new Error('down'))
            .mockResolvedValue(templatesResponse());
        const source = createAddressTemplateSource({ fetch, now: time.now });
        await expect(source.load()).rejects.toBeInstanceOf(AddressLayoutsUnavailableError);
        time.set(TEMPLATES_RETRY_BACKOFF_MS - 1);
        await expect(source.load()).rejects.toBeInstanceOf(AddressLayoutsUnavailableError);
        expect(fetch).toHaveBeenCalledTimes(1);
        time.set(TEMPLATES_RETRY_BACKOFF_MS);
        await expect(source.load()).resolves.toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('runs the TTL from the successful response, not the request', async () => {
        const time = clock();
        const fetch = vi.fn(async () => {
            time.set(4_000);
            return templatesResponse();
        });
        const source = createAddressTemplateSource({ fetch, now: time.now });
        await source.load();
        time.set(4_000 + TEMPLATES_TTL_MS - 1);
        await source.load();
        expect(fetch).toHaveBeenCalledTimes(1);
        time.set(4_000 + TEMPLATES_TTL_MS);
        await source.load();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('treats a response missing one id as a failure', async () => {
        const response = templatesResponse();
        response.templates = response.templates.filter(
            (template: any) => template.id !== ADDRESS_TEMPLATE_IDS.MLA_IL,
        );
        const source = createAddressTemplateSource({ fetch: async () => response });
        await expect(source.load()).rejects.toThrow(
            'Could not load the address layouts. Please try again later.',
        );
    });

    it('requests the overridden origin with the fixed path, namespace and 12 ids, and logs it once', async () => {
        const fetch = vi.fn(async () => templatesResponse());
        const log = vi.fn();
        const source = createAddressTemplateSource({ fetch, origin: 'http://127.0.0.1:9', log });
        await source.load();
        const ids = Object.values(ADDRESS_TEMPLATE_IDS)
            .map((id) => `templateIds=${id}`)
            .join('&');
        expect(fetch).toHaveBeenCalledWith(
            `http://127.0.0.1:9/form-template-service/v2/templates?namespace=wix.form_platform.form&${ids}`,
        );
        expect(log.mock.calls).toEqual([
            ['[wix-forms] address templates origin overridden to http://127.0.0.1:9 (QA only)'],
        ]);
    });

    it('keeps only the origin of a value with a path', async () => {
        const fetch = vi.fn(async (_url: string) => templatesResponse());
        await createAddressTemplateSource({ fetch, origin: 'http://x/y', log: () => {} }).load();
        expect(fetch.mock.calls[0][0]).toMatch(
            /^http:\/\/x\/form-template-service\/v2\/templates\?/,
        );
    });

    it('throws at creation for an invalid value, naming the variable', () => {
        expect(() => createAddressTemplateSource({ fetch: vi.fn(), origin: 'not a url' })).toThrow(
            'WIX_FORMS_ADDRESS_TEMPLATES_ORIGIN',
        );
    });
});

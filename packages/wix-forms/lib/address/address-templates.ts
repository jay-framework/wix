/**
 * Address layouts from Wix's public List Form Templates API (DL #52 Q1-Q3, Q18). Server-only.
 *
 * One cache per source: success-only, TTL 1 h from the successful response, one shared in-flight
 * promise, a 5 s timeout, and a 30 s backoff after a failure in which calls fail fast. A response
 * that is missing a template, or whose template has a part outside the eight, is a failure: a
 * layout is never trusted partially.
 */

import type { RawFormField } from '../wix-apis/get-form.js';
import { inLayoutOrder } from '../utils/layout-order.js';
import { ADDRESS_TEMPLATE_IDS } from './address-countries.js';
import { isLayoutPart, type LayoutPart } from './address-types.js';

export const TEMPLATES_TTL_MS = 60 * 60 * 1000;
export const TEMPLATES_TIMEOUT_MS = 5_000;
export const TEMPLATES_RETRY_BACKOFF_MS = 30_000;
export const DEFAULT_TEMPLATES_ORIGIN = 'https://www.wixapis.com';
export const TEMPLATES_ORIGIN_ENV = 'WIX_FORMS_ADDRESS_TEMPLATES_ORIGIN';
const TEMPLATES_PATH = '/form-template-service/v2/templates';
const TEMPLATES_NAMESPACE = 'wix.form_platform.form';

/** One part of a template, in template order. */
export interface RawAddressTemplateField {
    part: LayoutPart;
    hidden: boolean;
    required: boolean;
    maxLength?: number;
    pattern?: string;
    /** The subdivision codes; empty when the template lists none. */
    enumValues: string[];
}

export interface RawAddressTemplate {
    id: string;
    name: string;
    fields: RawAddressTemplateField[];
}

/** templateId → template, for all 12 address templates. */
export type AddressTemplates = Record<string, RawAddressTemplate>;

export interface AddressTemplateSource {
    /** Rejects with `AddressLayoutsUnavailableError` when the layouts cannot be loaded. */
    load(): Promise<AddressTemplates>;
}

export const ADDRESS_LAYOUTS_UNAVAILABLE_MESSAGE =
    'Could not load the address layouts. Please try again later.';

/** Transient: the form is unavailable, never unsupported (Q3). */
export class AddressLayoutsUnavailableError extends Error {
    constructor(cause?: unknown) {
        super(ADDRESS_LAYOUTS_UNAVAILABLE_MESSAGE, { cause });
        this.name = 'AddressLayoutsUnavailableError';
    }
}

/** Requests `url` and resolves its JSON body; rejects on a non-2xx answer. */
export type FetchTemplatesJson = (url: string) => Promise<unknown>;

export interface AddressTemplateSourceOptions {
    fetch: FetchTemplatesJson;
    /** Scheme, host and port only (Q18); a path is ignored. Default: the Wix API origin. */
    origin?: string;
    now?: () => number;
    log?: (message: string) => void;
}

export function createAddressTemplateSource(
    options: AddressTemplateSourceOptions,
): AddressTemplateSource {
    const now = options.now ?? Date.now;
    const log = options.log ?? ((message: string) => console.warn(message));
    const origin = templatesOriginOf(options.origin);
    const url = templatesUrl(origin);
    let cached: { templates: AddressTemplates; expiresAt: number } | undefined;
    let loading: Promise<AddressTemplates> | undefined;
    let retryAfter: number | undefined;
    let hasLoggedOverride = false;

    function fetchTemplates(): Promise<AddressTemplates> {
        if (origin !== DEFAULT_TEMPLATES_ORIGIN && !hasLoggedOverride) {
            hasLoggedOverride = true;
            log(`[wix-forms] address templates origin overridden to ${origin} (QA only)`);
        }
        return withTimeout(options.fetch(url), TEMPLATES_TIMEOUT_MS).then(parseAddressTemplates);
    }

    return {
        async load() {
            if (cached && now() < cached.expiresAt) return cached.templates;
            if (retryAfter !== undefined && now() < retryAfter) {
                throw new AddressLayoutsUnavailableError('retrying after a failed load');
            }
            loading ??= fetchTemplates().then(
                (templates) => {
                    cached = { templates, expiresAt: now() + TEMPLATES_TTL_MS };
                    loading = undefined;
                    return templates;
                },
                (error: unknown) => {
                    loading = undefined;
                    retryAfter = now() + TEMPLATES_RETRY_BACKOFF_MS;
                    throw new AddressLayoutsUnavailableError(error);
                },
            );
            return loading;
        },
    };
}

/** The origin the source requests, from an explicit value or `WIX_FORMS_ADDRESS_TEMPLATES_ORIGIN`. */
export function templatesOriginOf(value: string | undefined): string {
    if (value === undefined || value === '') return DEFAULT_TEMPLATES_ORIGIN;
    try {
        const origin = new URL(value).origin;
        if (origin === 'null') throw new Error('no origin');
        return origin;
    } catch {
        throw new Error(
            `${TEMPLATES_ORIGIN_ENV} "${value}" is not a URL origin (e.g. http://127.0.0.1:9). Fix or unset it.`,
        );
    }
}

export function templatesUrl(origin: string): string {
    const ids = Object.values(ADDRESS_TEMPLATE_IDS)
        .map((id) => `templateIds=${id}`)
        .join('&');
    return `${origin}${TEMPLATES_PATH}?namespace=${TEMPLATES_NAMESPACE}&${ids}`;
}

interface RawTemplate {
    id?: string;
    name?: string;
    formFields?: RawFormField[];
    steps?: Parameters<typeof inLayoutOrder>[0]['steps'];
}

/**
 * The 12 templates by id. Wix lists each id more than once, and a copy may carry no usable
 * fields: the first copy whose every field has a target is kept. Throws when an id has no such
 * copy or a target is not one of the eight parts.
 */
export function parseAddressTemplates(json: unknown): AddressTemplates {
    const listed = ((json as { templates?: RawTemplate[] })?.templates ?? []).filter(
        (template) => template.id && (template.formFields ?? []).length > 0,
    );
    const templates: AddressTemplates = {};
    for (const id of Object.values(ADDRESS_TEMPLATE_IDS)) {
        const copy = listed.find(
            (template) => template.id === id && template.formFields!.every(hasTarget),
        );
        if (!copy) throw new Error(`address template ${id} is missing from the response`);
        templates[id] = parseTemplate(copy);
    }
    return templates;
}

function hasTarget(field: RawFormField): boolean {
    return Boolean(field.inputOptions?.target);
}

function parseTemplate(template: RawTemplate): RawAddressTemplate {
    return {
        id: template.id!,
        name: template.name ?? '',
        fields: inLayoutOrder(template).map((field) => parseField(template.id!, field)),
    };
}

function parseField(templateId: string, field: RawFormField): RawAddressTemplateField {
    const part = field.inputOptions!.target;
    if (!isLayoutPart(part)) {
        throw new Error(`address template ${templateId} has an unknown part "${part}"`);
    }
    const validation = field.inputOptions?.stringOptions?.validation;
    const enumValues = (validation?.enum ?? []).filter(
        (value): value is string => typeof value === 'string' && value !== '',
    );
    return {
        part,
        hidden: Boolean(field.hidden),
        required: Boolean(field.inputOptions?.required),
        ...(validation?.maxLength !== undefined ? { maxLength: validation.maxLength } : {}),
        ...(validation?.pattern !== undefined ? { pattern: validation.pattern } : {}),
        enumValues,
    };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new Error(`List Form Templates timed out after ${timeoutMs} ms`)),
            timeoutMs,
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

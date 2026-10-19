import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { RawFormField } from './get-form.js';

/**
 * List Forms (Wix Form Schema Service v4).
 *
 * `GET /form-schema-service/v4/forms?namespace=…` returns every form in a
 * namespace, each already carrying its full `formFields` schema — so a single
 * (cursor-paged) call yields everything needed to generate per-form contracts
 * at build time, with no per-form `getFormSchema` fetch. Sibling of
 * `get-form.ts`; same `wixFetch` pattern (DL#36, OQ-1).
 */

export interface ListedForm {
    id: string;
    name?: string;
    formFields?: RawFormField[];
}

interface ListFormsResponse {
    forms?: ListedForm[];
    pagingMetadata?: {
        cursors?: { next?: string };
    };
}

/** Which forms to enumerate — maps to the List Forms `enabled`/`disabled` filter (DL#36 config). */
export type FormInclude = 'enabled' | 'disabled' | 'all';

export interface ListFormsParams {
    namespace: string;
    /** Restrict enumeration to these form ids (optional whitelist). */
    formIds?: string[];
    /** Default `enabled`. */
    include?: FormInclude;
    /** Cursor page size (0-100). */
    pageLimit?: number;
}

const DEFAULT_PAGE_LIMIT = 100;

/**
 * Lists every form in a namespace, following the response cursor to completion.
 * Throws {@link WixApiError} on a non-2xx response (surfaced to the caller).
 */
export async function listForms(client: WixClient, params: ListFormsParams): Promise<ListedForm[]> {
    const forms: ListedForm[] = [];
    let cursor: string | undefined;

    do {
        const query = buildQuery(params, cursor);
        const response = await wixFetch<ListFormsResponse>(
            client,
            `/form-schema-service/v4/forms${query}`,
            { method: 'GET' },
        );
        forms.push(...(response.forms ?? []));
        cursor = response.pagingMetadata?.cursors?.next || undefined;
    } while (cursor);

    return forms;
}

function buildQuery(params: ListFormsParams, cursor: string | undefined): string {
    const search = new URLSearchParams();
    search.set('namespace', params.namespace);
    search.set('paging.limit', String(params.pageLimit ?? DEFAULT_PAGE_LIMIT));
    if (cursor) {
        search.set('paging.cursor', cursor);
    }
    for (const formId of params.formIds ?? []) {
        search.append('formIds', formId);
    }
    applyIncludeFilter(search, params.include);
    return `?${search.toString()}`;
}

function applyIncludeFilter(search: URLSearchParams, include: FormInclude | undefined): void {
    if (include === 'enabled' || include === undefined) {
        search.set('enabled', 'true');
    } else if (include === 'disabled') {
        search.set('disabled', 'true');
    }
    // 'all' → no enabled/disabled filter.
}

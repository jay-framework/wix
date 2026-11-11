/**
 * The runtime submit allowlist (DL #50 §1): which form ids the public `submitForm` action accepts.
 * Configured `formIds` win; otherwise the namespace's enabled forms, listed once per process.
 * The load fails closed: a failure or a timeout is not cached and opens a retry backoff, so junk
 * requests during a Wix outage cannot drive repeated List Forms calls with site credentials.
 */

import { canonicalFormId } from '../utils/form-id.js';

export const ALLOWLIST_LOAD_TIMEOUT_MS = 10_000;
export const ALLOWLIST_RETRY_BACKOFF_MS = 15_000;

export interface SubmittableFormsSource {
    /** Named in the empty-list warning. */
    namespace: string;
    configuredFormIds: readonly string[];
    listEnabledFormIds(): Promise<string[]>;
}

export type SubmittableFormCheck = (canonicalId: string) => Promise<boolean>;

/** A check for canonical form ids. Configured ids win; otherwise one shared, success-only cached list. Each check owns its own cache and backoff. */
export function createSubmittableFormCheck(source: SubmittableFormsSource): SubmittableFormCheck {
    if (source.configuredFormIds.length > 0) {
        const configured = configuredFormIdSet(source.configuredFormIds);
        return async (canonicalId) => configured.has(canonicalId);
    }
    return createListedFormCheck(source);
}

/** Q11: the mode follows the raw config, so an all-invalid list stays an empty configured set. */
function configuredFormIdSet(entries: readonly string[]): Set<string> {
    const ids = new Set<string>();
    for (const entry of entries) {
        const id = canonicalFormId(entry);
        if (id) ids.add(id);
        else console.warn(`[wix-forms] formIds entry "${entry}" is not a form id; it is ignored`);
    }
    if (ids.size === 0) {
        console.warn('[wix-forms] formIds has no valid form id: every submission is refused');
    }
    return ids;
}

function createListedFormCheck(source: SubmittableFormsSource): SubmittableFormCheck {
    let loading: Promise<Set<string>> | undefined;
    let retryAfterMs: number | undefined;

    const onLoadFailure = (error: unknown): never => {
        loading = undefined;
        retryAfterMs = Date.now() + ALLOWLIST_RETRY_BACKOFF_MS;
        throw error;
    };

    return async (canonicalId) => {
        if (retryAfterMs !== undefined && Date.now() < retryAfterMs) {
            throw new Error('submittable forms are unavailable (retrying after a failed load)');
        }
        loading ??= withTimeout(source.listEnabledFormIds(), ALLOWLIST_LOAD_TIMEOUT_MS).then(
            (ids) => toCanonicalSet(ids, source.namespace),
            onLoadFailure,
        );
        return (await loading).has(canonicalId);
    };
}

function toCanonicalSet(ids: string[], namespace: string): Set<string> {
    const canonical = new Set<string>();
    for (const id of ids) {
        const formId = canonicalFormId(id);
        if (formId) canonical.add(formId);
    }
    if (canonical.size === 0) {
        console.warn(
            `[wix-forms] no enabled forms in namespace "${namespace}": every submission is refused until restart`,
        );
    }
    return canonical;
}

/** `wixFetch` has no abort signal, so a timed-out load is abandoned and its late result dropped. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () =>
                reject(new Error(`listing the submittable forms timed out after ${timeoutMs} ms`)),
            timeoutMs,
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

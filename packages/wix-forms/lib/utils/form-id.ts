/**
 * The one canonical form id (DL#49). Every form id the server compares or puts in a Wix path goes
 * through `canonicalFormId`, so comparisons and paths agree and no crafted id reaches a Wix URL.
 */

// No `m` flag: `$` must not match before a trailing newline.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The lowercase GUID form of a Wix form id; undefined when `raw` is not a GUID string. */
export function canonicalFormId(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    return GUID.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

/** The canonical id, URI-encoded for a Wix path; throws when it is not a form id. */
export function formIdPathSegment(formId: string): string {
    const canonical = canonicalFormId(formId);
    if (!canonical) throw new Error('Form ID is not a valid Wix form id.');
    // A no-op for a GUID, but keeps this builder correct on its own.
    return encodeURIComponent(canonical);
}

/**
 * wixFetch — call Wix REST APIs using SDK auth headers.
 *
 * Works with both ApiKeyStrategy (server) and OAuthStrategy (client).
 * The SDK client handles auth; this helper gets headers and calls fetch.
 *
 * Usage:
 *   import { wixFetch } from '@jay-framework/wix-server-client';
 *   const products = await wixFetch(client, '/stores/v3/products/query', {
 *       method: 'POST',
 *       body: { query: { paging: { limit: 10 } } },
 *   });
 */

import type { WixClient } from '@wix/sdk';

const WIX_API_BASE = 'https://www.wixapis.com';

export interface WixFetchOptions {
    method?: string;
    body?: any;
    /**
     * The caller's access token (`RequestIdentity.authorization`, DL#43). When set, it is the only
     * credential sent; the client's own auth headers are not read.
     */
    authorization?: string;
}

export async function wixFetch<T = any>(
    client: WixClient,
    path: string,
    options: WixFetchOptions = {},
): Promise<T> {
    const { method = 'GET', body, authorization } = options;
    const authHeaders = await authHeadersFor(client, path, authorization);

    const response = await fetch(`${WIX_API_BASE}${path}`, {
        method,
        headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new WixApiError(response.status, path, text);
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
}

/** Never sends an unauthenticated request: a headers-only caller client has empty auth headers. */
async function authHeadersFor(
    client: WixClient,
    path: string,
    authorization: string | undefined,
): Promise<Record<string, string>> {
    if (authorization) return { Authorization: authorization };
    const { headers } = await (client.auth as any).getAuthHeaders();
    if (!headers?.Authorization) {
        throw new Error(
            `wixFetch: no Authorization for ${path}; pass the caller's authorization or use the site client`,
        );
    }
    return headers;
}

/**
 * Standard Wix API filter type.
 * Supports operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin,
 * $exists, $begins, $hasSome, $hasAll, $matchItems, $contains.
 */
type FilterPrimitive = string | number | boolean | null;
type FilterOperator = {
    $eq?: FilterPrimitive;
    $ne?: FilterPrimitive;
    $gt?: string | number;
    $gte?: string | number;
    $lt?: string | number;
    $lte?: string | number;
    $in?: Array<string | number>;
    $nin?: Array<string | number>;
    $exists?: boolean;
    $begins?: string;
    $startsWith?: string;
    $hasSome?: Array<string | number>;
    $hasAll?: Array<string | number>;
    $contains?: string;
    $matchItems?: WixFilter[];
};
export interface WixFilter {
    [key: string]: FilterPrimitive | FilterOperator | WixFilter[];
}

/**
 * Standard Wix API sort type.
 */
export interface WixSort {
    fieldName: string;
    order?: 'ASC' | 'DESC';
}

/**
 * Standard Wix API paging type.
 */
export interface WixPaging {
    limit?: number;
    offset?: number;
}

/**
 * Standard Wix API cursor paging type.
 */
export interface WixCursorPaging {
    cursor?: string;
    limit?: number;
}

export class WixApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly path: string,
        public readonly responseBody: string,
    ) {
        super(`Wix API ${status}: ${path}`);
        this.name = 'WixApiError';
    }
}

/** The Wix data error code for "the current user does not have permissions" (DL#43 V2). */
const DATA_PERMISSION_DENIED_CODE = 'WDE0027';

/**
 * True when Wix refused the call for the caller's permissions (DL#43 §Design 1).
 * SDK data errors: exactly WDE0027 (an invalid token, WDE0117, is not a permission refusal).
 * WixApiError: no status qualifies until the forms-side V2 check records one.
 */
export function isPermissionDenied(error: unknown): boolean {
    if (error instanceof WixApiError) return false;
    const code = (error as { details?: { applicationError?: { code?: unknown } } } | undefined)
        ?.details?.applicationError?.code;
    return code === DATA_PERMISSION_DENIED_CODE;
}

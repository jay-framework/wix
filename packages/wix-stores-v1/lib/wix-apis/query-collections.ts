import type { WixClient } from '@wix/sdk';
import {
    wixFetch,
    type WixFilter,
    type WixSort,
    type WixPaging,
} from '@jay-framework/wix-server-client';
import type { QueryCollectionsV1Response, V1Collection } from './types.js';

export interface QueryCollectionsV1Request {
    filter?: WixFilter;
    sort?: WixSort[];
    paging?: WixPaging;
    includeNumberOfProducts?: boolean;
    includeDescription?: boolean;
}

function normalizeCollection(col: Record<string, unknown>): V1Collection {
    const c = { ...col } as V1Collection;
    if (col.id && !c._id) {
        c._id = col.id as string;
    }
    return c;
}

export async function queryCollections(
    client: WixClient,
    request?: QueryCollectionsV1Request,
): Promise<QueryCollectionsV1Response> {
    const query: Record<string, unknown> = {};
    if (request?.filter) query.filter = JSON.stringify(request.filter);
    if (request?.sort) {
        const v1Sort = request.sort.map((s) => ({
            [s.fieldName]: (s.order || 'ASC').toLowerCase(),
        }));
        query.sort = JSON.stringify(v1Sort);
    }
    if (request?.paging) query.paging = request.paging;

    const result = await wixFetch<QueryCollectionsV1Response>(
        client,
        '/stores/v1/collections/query',
        {
            method: 'POST',
            body: {
                query,
                includeNumberOfProducts: request?.includeNumberOfProducts ?? true,
                includeDescription: request?.includeDescription ?? true,
            },
        },
    );
    if (result.collections) {
        result.collections = result.collections.map((c) =>
            normalizeCollection(c as Record<string, unknown>),
        );
    }
    return result;
}

import type { WixClient } from '@wix/sdk';
import {
    wixFetch,
    type WixFilter,
    type WixSort,
    type WixPaging,
} from '@jay-framework/wix-server-client';
import type { QueryProductsV1Response, V1Product } from './types.js';

export interface QueryProductsV1Request {
    filter?: WixFilter;
    sort?: WixSort[];
    paging?: WixPaging;
    includeVariants?: boolean;
    includeMerchantSpecificData?: boolean;
}

function normalizeProduct(product: Record<string, unknown>): V1Product {
    const p = { ...product } as V1Product;
    const raw = product as Record<string, unknown>;
    if (raw.id && !p._id) {
        p._id = raw.id as string;
    }
    return p;
}

/**
 * Offset paging is only consistent under a total order: the default order and ties of a user sort are not
 * stable across requests, so products are duplicated or skipped between pages (e.g. 786 products returned
 * as 751-779 unique ones). When paging, break ties by numericId.
 */
export function stableSort(request?: QueryProductsV1Request): WixSort[] {
    const sort = [...(request?.sort ?? [])];
    if (request?.paging && !sort.some((s) => s.fieldName === 'numericId')) {
        sort.push({ fieldName: 'numericId', order: 'ASC' });
    }
    return sort;
}

export async function queryProducts(
    client: WixClient,
    request?: QueryProductsV1Request,
): Promise<QueryProductsV1Response> {
    const query: Record<string, unknown> = {};
    if (request?.filter) query.filter = JSON.stringify(request.filter);
    const sort = stableSort(request);
    if (sort.length) {
        const v1Sort = sort.map((s) => ({
            [s.fieldName]: (s.order || 'ASC').toLowerCase(),
        }));
        query.sort = JSON.stringify(v1Sort);
    }
    if (request?.paging) query.paging = request.paging;

    const result = await wixFetch<QueryProductsV1Response>(client, '/stores/v1/products/query', {
        method: 'POST',
        body: {
            query,
            includeVariants: request?.includeVariants ?? true,
            // Merchant-specific data (cost, profit, ...) requires WIX_STORES.MODIFY_PRODUCTS: a storefront
            // (visitor or read-only) client gets 403. Only request it explicitly.
            includeMerchantSpecificData: request?.includeMerchantSpecificData ?? false,
        },
    });
    if (result.products) {
        result.products = result.products.map((p) =>
            normalizeProduct(p as Record<string, unknown>),
        );
    }
    return result;
}

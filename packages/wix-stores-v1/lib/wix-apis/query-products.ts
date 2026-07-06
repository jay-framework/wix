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

export async function queryProducts(
    client: WixClient,
    request?: QueryProductsV1Request,
): Promise<QueryProductsV1Response> {
    const query: Record<string, unknown> = {};
    if (request?.filter) query.filter = JSON.stringify(request.filter);
    if (request?.sort) {
        const v1Sort = request.sort.map((s) => ({ [s.fieldName]: (s.order || 'ASC').toLowerCase() }));
        query.sort = JSON.stringify(v1Sort);
    }
    if (request?.paging) query.paging = request.paging;

    const result = await wixFetch<QueryProductsV1Response>(client, '/stores/v1/products/query', {
        method: 'POST',
        body: {
            query,
            includeVariants: request?.includeVariants ?? true,
            includeMerchantSpecificData: request?.includeMerchantSpecificData ?? true,
        },
    });
    if (result.products) {
        result.products = result.products.map((p) =>
            normalizeProduct(p as Record<string, unknown>),
        );
    }
    return result;
}

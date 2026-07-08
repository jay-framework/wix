import type { WixClient } from '@wix/sdk';
import {
    wixFetch,
    type WixFilter,
    type WixSort,
    type WixPaging,
} from '@jay-framework/wix-server-client';
import type { Category, QueryCategoriesResponse } from './types.js';

export interface QueryCategoriesRequest {
    filter?: WixFilter;
    sort?: WixSort[];
    paging?: WixPaging;
    treeReference?: { appNamespace?: string };
}

function normalizeCategory(cat: Record<string, unknown>): Category {
    if (!cat) return cat as Category;
    const normalized: Record<string, unknown> = { ...cat };
    if (normalized.id && !normalized._id) {
        normalized._id = normalized.id;
    }
    const parentCategory = normalized.parentCategory as Record<string, unknown> | undefined;
    if (parentCategory?.id && !parentCategory?._id) {
        normalized.parentCategory = { ...parentCategory, _id: parentCategory.id };
    }
    return normalized as Category;
}

export async function queryCategories(
    client: WixClient,
    options?: QueryCategoriesRequest,
): Promise<QueryCategoriesResponse> {
    const result = await wixFetch<QueryCategoriesResponse>(
        client,
        '/categories/v1/categories/query',
        {
            method: 'POST',
            body: {
                query: {
                    filter: options?.filter,
                    sort: options?.sort,
                    paging: options?.paging,
                },
                treeReference: options?.treeReference || { appNamespace: '@wix/stores' },
            },
        },
    );
    if (result.categories) {
        result.categories = result.categories.map((c) =>
            normalizeCategory(c as Record<string, unknown>),
        );
    }
    return result;
}

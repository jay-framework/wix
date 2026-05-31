import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { GetCategoryResponse } from './types.js';

export async function getCategory(
    client: WixClient,
    categoryId: string,
): Promise<GetCategoryResponse> {
    const result = await wixFetch<GetCategoryResponse>(
        client,
        `/categories/v1/categories/${categoryId}`,
        {
            method: 'GET',
        },
    );
    if (result.category) {
        const raw = result.category as Record<string, unknown>;
        if (raw.id && !result.category._id) {
            result.category._id = raw.id as string;
        }
        if (result.category.parentCategory) {
            const rawParent = result.category.parentCategory as Record<string, unknown>;
            if (rawParent.id && !result.category.parentCategory._id) {
                result.category.parentCategory = {
                    ...result.category.parentCategory,
                    _id: rawParent.id as string,
                };
            }
        }
    }
    return result;
}

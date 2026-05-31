import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { GetCategoryResponse } from './types.js';

export async function getCategory(
    client: WixClient,
    categoryId: string,
): Promise<GetCategoryResponse> {
    return wixFetch(client, `/categories/v1/categories/${categoryId}`, {
        method: 'GET',
    });
}

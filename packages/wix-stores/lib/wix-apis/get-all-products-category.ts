import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

interface GetAllProductsCategoryResponse {
    categoryId?: string;
}

export async function getAllProductsCategory(
    client: WixClient,
): Promise<GetAllProductsCategoryResponse> {
    return wixFetch<GetAllProductsCategoryResponse>(client, '/stores/v3/all-products-category', {
        method: 'GET',
    });
}

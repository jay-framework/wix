import { getClient } from "./wix-client.js";
import { productsV3 } from "@wix/stores";
import * as fs from 'fs';
import * as path from 'path';
import {categories} from "@wix/categories";
import {WixClient} from "@wix/sdk";

interface ProductsResponse {
    products: any[];
    totalCount: number;
    pageSize: number;
    hasNext: boolean;
}

export function getCategoriesClient(wixClient: WixClient): typeof categories {
    return wixClient.use(categories) as unknown as typeof categories;
}

async function queryCategories(wixClient: WixClient): Promise<void> {
    const categoriesClient = wixClient.use(categories)
    const result = await categoriesClient.queryCategories({
        treeReference: {
            appNamespace: '@wix/stores'
        }
    })
        .eq('visible', true)
        .find();

    console.log(result.items.map(item => `${item.name}: ${item._id}`));
}

async function queryProducts(wixClient: WixClient): Promise<void> {
    const productsClient = wixClient.use(productsV3);
    let itemCount = 0;
    let next: string | null | undefined = 'initial';
    const pageSize = 100; // Wix API default/max page size

    console.log('📦 Fetching products...');

    while (next) {

        const cursorPaging = next !== 'initial'? { cursor: next, limit: 12 }: { limit: 12 };
        const filter = {
            "$and": [
                {"actualPriceRange.minValue.amount": {"$gt": "50"}},
                {"actualPriceRange.minValue.amount": {"$lt": "500"}}
            ],
            "inventory.availabilityStatus": {"$eq": "IN_STOCK"},
            "allCategoriesInfo.categories": {"$matchItems": [
                    {
                        id: {
                            $eq: "bc0990ba-e6c6-450c-94cc-a0c62543eb13"
                        }
                    }
                ]},
        }
        const sort = [{fieldName: "actualPriceRange.minValue.amount", order: "ASC"}];

        let response = await productsClient
            .searchProducts({
                    // @ts-ignore
                    filter,
                    cursorPaging,
                    // @ts-ignore
                    sort
                },
                {fields: ['CURRENCY', 'INFO_SECTION', 'PLAIN_DESCRIPTION', 'INFO_SECTION_PLAIN_DESCRIPTION',
                        'VARIANT_OPTION_CHOICE_NAMES', 'MEDIA_ITEMS_INFO', 'DIRECT_CATEGORIES_INFO', 'THUMBNAIL',
                        'INFO_SECTION_DESCRIPTION']})

        if (response.products && response.products.length > 0) {
            response.products.forEach(product => console.log(product.name));
        }

        // Check if there are more pages
        next = response.pagingMetadata?.cursors?.next;
        itemCount += response.products?.length || 0;
    }
    console.log("item count:", itemCount);

}

export async function aggregateProducts(wixClient: WixClient): Promise<void> {
    const productsClient = wixClient.use(productsV3);

    const result = await productsClient.searchProducts({
        aggregations: [
            {
                fieldPath: 'actualPriceRange.minValue.amount',
                name: 'price-buckets',
                type: "RANGE",
                range: {
                    buckets: [{from: 0, to: 50}, {from: 50, to: 100}, {from: 100, to: 200}, {from: 200, to: 400}, {from: 400, to: 800}]
                }
            },
            {
                fieldPath: 'actualPriceRange.minValue.amount',
                name: 'min-price',
                type: "SCALAR",
                scalar: {
                    type: "MIN"
                }
            },
            {
                fieldPath: 'actualPriceRange.minValue.amount',
                name: 'max-price',
                type: "SCALAR",
                scalar: {
                    type: "MAX"
                }
            },
            {
                fieldPath: 'actualPriceRange.minValue.amount',
                name: 'price-value',
                type: "VALUE",
                value: {}
            },
            {
                fieldPath: 'slug',
                name: 'slug',
                type: "SCALAR",
                scalar: { type: "COUNT_DISTINCT"}
            }
        ]
    })
    console.log("result:", JSON.stringify(result?.aggregationData?.results, undefined, 2));
}

async function queryPlayground() {
    console.log('🚀 Starting Wix Products Query (Catalog V3)...\n');
    
    try {
        // Get Wix client
        const wixClient = getClient();

        // await queryCategories(wixClient);

        await queryProducts(wixClient);

        // await aggregateProducts(wixClient);


    } catch (error) {
        console.error('❌ Error querying products:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Run the query
queryPlayground();


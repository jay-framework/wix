import { getClient } from "./wix-client.js";
import { productsV3 } from "@wix/stores";
import * as fs from 'fs';
import * as path from 'path';
import {categories} from "@wix/categories";

interface ProductsResponse {
    products: any[];
    totalCount: number;
    pageSize: number;
    hasNext: boolean;
}

async function queryPlayground() {
    console.log('🚀 Starting Wix Products Query (Catalog V3)...\n');
    
    try {
        // Get Wix client
        const wixClient = getClient();
        const productsClient = wixClient.use(productsV3);

        const categoriesClient = wixClient.use(categories)

        const result = await categoriesClient.queryCategories({
            treeReference: {
                appNamespace: '@wix/stores'
            }
        })
            .eq('visible', true)
            .find();

        console.log(result.items.map(item => `${item.name}: ${item._id}`));


        // Query products with pagination
        let allProducts: any[] = [];
        let itemCount = 0;
        let next: string | null | undefined = 'initial';
        const pageSize = 100; // Wix API default/max page size
        
        console.log('📦 Fetching products...');
        
        while (next) {

            const cursorPaging = next !== 'initial'? { cursor: next, limit: 12 }: { limit: 12 };
            const filter = {
                "actualPriceRange.minValue.amount": {"$gt": "50"},
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


import { getClient } from './wix-client.js';
import { productsV3, customizationsV3 } from '@wix/stores';
import { categories } from '@wix/categories';
import { items } from '@wix/data';
import { WixClient } from '@wix/sdk';
import { V3ProductSearch, SearchProductsOptions } from '@wix/auto_sdk_stores_products-v-3';

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
    const categoriesClient = wixClient.use(categories);
    const result = await categoriesClient
        .queryCategories({
            treeReference: {
                appNamespace: '@wix/stores',
            },
        })
        .eq('visible', true)
        .find();

    console.log(result.items.map((item) => `${item.name}: ${item._id}`));
}

async function queryProducts(wixClient: WixClient): Promise<void> {
    const productsClient = wixClient.use(productsV3);
    let itemCount = 0;
    let next: string | null | undefined = 'initial';
    const pageSize = 100; // Wix API default/max page size

    console.log('📦 Fetching products...');

    const searchFields: SearchProductsOptions['fields'] = [
        'CURRENCY',
        'INFO_SECTION',
        'PLAIN_DESCRIPTION',
        'INFO_SECTION_PLAIN_DESCRIPTION',
        'VARIANT_OPTION_CHOICE_NAMES',
        'MEDIA_ITEMS_INFO',
        'DIRECT_CATEGORIES_INFO',
        'THUMBNAIL',
        'INFO_SECTION_DESCRIPTION',
    ];

    const optionFilter: V3ProductSearch['filter'] = {
        'options.name': {
            $hasSome: ['צבע'],
        },
        'options.choicesSettings.choices.name': {
            $hasSome: ['שחור'],
        },
    };

    const priceFilter: V3ProductSearch['filter'] = {
        $and: [
            { 'actualPriceRange.minValue.amount': { $gt: '50' } },
            { 'actualPriceRange.minValue.amount': { $lt: '500' } },
        ],
    };
    const inStockFilter: V3ProductSearch['filter'] = {
        'inventory.availabilityStatus': { $eq: 'IN_STOCK' },
    };

    const allCategoriesFilter: V3ProductSearch['filter'] = {
        'allCategoriesInfo.categories': {
            $matchItems: [
                {
                    id: {
                        $eq: '024a9fff-77de-4508-b82c-5fce24f74757',
                    },
                },
            ],
        },
    };

    while (next) {
        const cursorPaging = next !== 'initial' ? { cursor: next, limit: 100 } : { limit: 100 };
        const filter: V3ProductSearch['filter'] = {
            ...optionFilter,
            // ...priceFilter,
            // ...inStockFilter,
            // ...allCategoriesFilter,
        };
        const sort: V3ProductSearch['sort'] = [
            { fieldName: 'actualPriceRange.minValue.amount', order: 'ASC' },
        ];
        const productSearch =
            next === 'initial' ? { filter, cursorPaging, sort } : { cursorPaging };

        let response = await productsClient.searchProducts(productSearch, {
            fields: searchFields,
        });

        // if (response.products && response.products.length > 0) {
        //     response.products.forEach((product) => console.log(product.name));
        // }
        console.log('loading', itemCount);
        // Check if there are more pages
        next = response.pagingMetadata?.cursors?.next;
        itemCount += response.products?.length || 0;
    }
    console.log('item count:', itemCount);
}

export async function aggregateProducts(wixClient: WixClient): Promise<void> {
    const productsClient = wixClient.use(productsV3);

    const result = await productsClient.searchProducts({
        aggregations: [
            {
                fieldPath: 'actualPriceRange.minValue.amount',
                name: 'price-buckets',
                type: 'RANGE',
                range: {
                    buckets: [
                        { from: 0, to: 50 },
                        { from: 50, to: 100 },
                        { from: 100, to: 200 },
                        { from: 200, to: 400 },
                        { from: 400, to: 800 },
                    ],
                },
            },
            {
                fieldPath: 'actualPriceRange.minValue.amount',
                name: 'min-price',
                type: 'SCALAR',
                scalar: {
                    type: 'MIN',
                },
            },
            {
                fieldPath: 'actualPriceRange.minValue.amount',
                name: 'max-price',
                type: 'SCALAR',
                scalar: {
                    type: 'MAX',
                },
            },
            {
                fieldPath: 'actualPriceRange.minValue.amount',
                name: 'price-value',
                type: 'VALUE',
                value: {},
            },
            {
                fieldPath: 'slug',
                name: 'slug',
                type: 'SCALAR',
                scalar: { type: 'COUNT_DISTINCT' },
            },
            {
                fieldPath: 'options.name',
                name: 'options_name',
                type: 'VALUE',
                value: {
                    limit: 50
                },
            },
            {
                fieldPath: 'options.choicesSettings.choices.name',
                name: 'options_value',
                type: 'VALUE',
                value: {
                    limit: 50
                },
            },
        ],
        filter: {
            'options.name': {
                $hasSome: ['צבע'],
            }
        },
    });
    console.log('result:', JSON.stringify(result?.aggregationData?.results, undefined, 2));
}

async function customizations(wixClient: WixClient): Promise<void> {
    const client = wixClient.use(customizationsV3);

    const res = await client.queryCustomizations({})
    console.log(JSON.stringify(res, undefined, 2));

    res.customizations?.forEach(customization => {
        console.log(customization.choicesSettings?.choices?.length);
    })
}

async function queryPlayground() {
    console.log('🚀 Starting Wix Products Query (Catalog V3)...\n');

    try {
        // Get Wix client
        const wixClient = getClient();

        // await queryCategories(wixClient);

        // await queryProducts(wixClient);

        await aggregateProducts(wixClient);

        // await customizations(wixClient);

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
// aggregateProducts();

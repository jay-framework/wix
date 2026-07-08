/**
 * Server-side test: query Wix APIs via REST using ApiKeyStrategy auth.
 *
 * Tests:
 * 1. Query products via /stores/v3/products/query
 * 2. Query categories via /stores/v1/categories/query
 * 3. Compare response shapes with what the SDK modules return
 */

import { createClient, ApiKeyStrategy } from '@wix/sdk';
import { wixFetch } from './wix-fetch.js';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// Load config
const configPath = path.join(process.cwd(), 'config', '.wix.yaml');
if (!fs.existsSync(configPath)) {
    console.error('config/.wix.yaml not found. Copy from config/.wix.yaml.example');
    process.exit(1);
}
const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;

// Create SDK client with API key auth — NO modules
const client = createClient({
    auth: ApiKeyStrategy({
        apiKey: config.apiKeyStrategy.apiKey,
        siteId: config.apiKeyStrategy.siteId,
    }),
    modules: {},
});

function writeResult(name: string, data: any) {
    const dir = path.join(process.cwd(), 'results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2));
    console.log(`  → wrote results/${name}.json`);
}

async function testQueryProducts() {
    console.log('\n=== Test 1: Query Products ===');

    const result = await wixFetch<any>(client, '/stores/v3/products/query', {
        method: 'POST',
        body: {
            query: {
                paging: { limit: 3 },
            },
        },
    });

    writeResult('query-products', result);
    console.log(`Found ${result.products?.length} products`);
    for (const product of (result.products || []).slice(0, 3)) {
        console.log(`  - ${product.name} (${product.slug})`);
    }

    return result;
}

async function testQueryCategories() {
    console.log('\n=== Test 2: Query Categories ===');

    const result = await wixFetch<any>(client, '/categories/v1/categories/query', {
        method: 'POST',
        body: {
            query: {
                filter: { visible: true },
                paging: { limit: 10 },
            },
            treeReference: { appNamespace: '@wix/stores' },
        },
    });

    writeResult('query-categories', result);
    console.log(`Found ${result.categories?.length} categories`);
    for (const cat of (result.categories || []).slice(0, 5)) {
        console.log(`  - ${cat.name} (${cat.slug})`);
    }

    return result;
}

async function testGetCurrentCart() {
    console.log(
        '\n=== Test 3: Get Current Cart (server — will likely fail without visitor context) ===',
    );

    try {
        const result = await wixFetch<any>(client, '/ecom/v1/carts/current', {
            method: 'GET',
        });
        console.log('Cart:', JSON.stringify(result, null, 2).substring(0, 300));
    } catch (e: any) {
        console.log(`Expected error (no visitor session): ${e.message.substring(0, 100)}`);
    }
}

async function testProductBySlug() {
    console.log('\n=== Test 4: Query Product by Slug ===');

    const result = await wixFetch<any>(client, '/stores/v3/products/query', {
        method: 'POST',
        body: {
            query: {
                filter: { slug: 'crew-t-shirt' },
                paging: { limit: 1 },
            },
        },
    });

    writeResult('get-product-by-slug', result);
    const product = result.products?.[0];
    if (product) {
        console.log(`Found: ${product.name}`);
        console.log(`  Top-level fields: ${Object.keys(product).join(', ')}`);
    } else {
        console.log('Product not found');
    }
}

async function testSearchWithAggregations() {
    console.log('\n=== Test 5: Search Products with Aggregations ===');

    // Try without aggregations first to see the base response shape
    const resultNoAgg = await wixFetch<any>(client, '/stores/v3/products/search', {
        method: 'POST',
        body: {
            search: {
                cursorPaging: { limit: 2 },
            },
        },
    });
    writeResult('search-products-no-agg', resultNoAgg);
    console.log('No-agg response keys:', Object.keys(resultNoAgg));

    // Try with aggregations — same format as stores-actions.ts
    const result = await wixFetch<any>(client, '/stores/v3/products/search', {
        method: 'POST',
        body: {
            search: {
                cursorPaging: { limit: 2 },
                aggregations: [
                    {
                        fieldPath: 'slug',
                        name: 'total-count',
                        type: 'SCALAR',
                        scalar: { type: 'COUNT_DISTINCT' },
                    },
                    {
                        fieldPath: 'actualPriceRange.minValue.amount',
                        name: 'min-price',
                        type: 'SCALAR',
                        scalar: { type: 'MIN' },
                    },
                    {
                        fieldPath: 'actualPriceRange.minValue.amount',
                        name: 'max-price',
                        type: 'SCALAR',
                        scalar: { type: 'MAX' },
                    },
                ],
            },
            fields: ['CURRENCY'],
        },
    });
    writeResult('search-products', result);

    writeResult('search-products', result);
    console.log('Response keys:', Object.keys(result));
    console.log('Products:', result.products?.length);

    // Check paging shape
    console.log('pagingMetadata:', JSON.stringify(result.pagingMetadata, null, 2));

    // Check aggregation shape
    console.log('aggregationData keys:', Object.keys(result.aggregationData || {}));
    if (result.aggregationData?.results) {
        console.log('aggregationData.results count:', result.aggregationData.results.length);
        for (const agg of result.aggregationData.results) {
            console.log(`  agg "${agg.name}":`, JSON.stringify(agg, null, 2));
        }
    } else {
        console.log(
            'aggregationData (full):',
            JSON.stringify(result.aggregationData, null, 2)?.substring(0, 500),
        );
    }
}

async function testCategoriesPaging() {
    console.log('\n=== Test: Categories query — offset paging (BROKEN) ===');

    const page1 = await wixFetch<any>(client, '/categories/v1/categories/query', {
        method: 'POST',
        body: {
            query: {
                filter: { visible: true },
                paging: { limit: 2, offset: 0 },
            },
            treeReference: { appNamespace: '@wix/stores' },
        },
    });
    console.log(`Page 1: ${page1.categories?.length} categories`);
    for (const c of page1.categories || []) console.log(`  - ${c.name} (${c.id})`);
    console.log('pagingMetadata:', JSON.stringify(page1.pagingMetadata));

    const page2 = await wixFetch<any>(client, '/categories/v1/categories/query', {
        method: 'POST',
        body: {
            query: {
                filter: { visible: true },
                paging: { limit: 2, offset: 2 },
            },
            treeReference: { appNamespace: '@wix/stores' },
        },
    });
    console.log(`Page 2: ${page2.categories?.length} categories`);
    for (const c of page2.categories || []) console.log(`  - ${c.name} (${c.id})`);
    console.log('pagingMetadata:', JSON.stringify(page2.pagingMetadata));

    const page1Ids = (page1.categories || []).map((c: any) => c.id);
    const page2Ids = (page2.categories || []).map((c: any) => c.id);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    console.log(`Overlap: ${overlap.length} (should be 0)`);
    if (overlap.length > 0) {
        console.error('PAGING IS BROKEN — same categories on both pages');
    }
}

async function testCategoriesSearchPaging() {
    console.log('\n=== Test: Categories SEARCH — cursor paging with filter ===');

    // Page 1: filter + cursorPaging (no cursor)
    const page1 = await wixFetch<any>(client, '/categories/v1/categories/search', {
        method: 'POST',
        body: {
            search: {
                filter: { visible: true },
                cursorPaging: { limit: 2 },
            },
            treeReference: { appNamespace: '@wix/stores' },
        },
    });
    console.log(`Page 1: ${page1.categories?.length} categories`);
    for (const c of page1.categories || []) console.log(`  - ${c.name} (${c.id})`);
    console.log('pagingMetadata:', JSON.stringify(page1.pagingMetadata));

    const nextCursor = page1.pagingMetadata?.cursors?.next;
    if (!nextCursor) {
        console.log('No next cursor — only 1 page');
        return;
    }

    // Page 2: cursor only (no filter — cursor encodes the query)
    const page2 = await wixFetch<any>(client, '/categories/v1/categories/search', {
        method: 'POST',
        body: {
            search: {
                cursorPaging: { cursor: nextCursor },
            },
            treeReference: { appNamespace: '@wix/stores' },
        },
    });
    console.log(`Page 2: ${page2.categories?.length} categories`);
    for (const c of page2.categories || []) console.log(`  - ${c.name} (${c.id})`);

    const page1Ids = (page1.categories || []).map((c: any) => c.id);
    const page2Ids = (page2.categories || []).map((c: any) => c.id);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    console.log(`Overlap: ${overlap.length} (should be 0)`);
    if (overlap.length === 0) console.log('SEARCH PAGING WORKS!');
    else console.error('SEARCH PAGING BROKEN');
}

async function testCategoriesQueryCursorPaging() {
    console.log('\n=== Test: Categories QUERY — cursor paging with filter ===');

    // Page 1: filter + cursorPaging (no cursor)
    const page1 = await wixFetch<any>(client, '/categories/v1/categories/query', {
        method: 'POST',
        body: {
            query: {
                filter: { visible: true },
                cursorPaging: { limit: 2 },
            },
            treeReference: { appNamespace: '@wix/stores' },
        },
    });
    console.log(`Page 1: ${page1.categories?.length} categories`);
    for (const c of page1.categories || []) console.log(`  - ${c.name} (${c.id})`);
    console.log('pagingMetadata:', JSON.stringify(page1.pagingMetadata));

    const nextCursor = page1.pagingMetadata?.cursors?.next;
    if (!nextCursor) {
        console.log('No next cursor — only 1 page');
        return;
    }

    // Page 2: cursor only (no filter)
    const page2 = await wixFetch<any>(client, '/categories/v1/categories/query', {
        method: 'POST',
        body: {
            query: {
                cursorPaging: { cursor: nextCursor },
            },
            treeReference: { appNamespace: '@wix/stores' },
        },
    });
    console.log(`Page 2: ${page2.categories?.length} categories`);
    for (const c of page2.categories || []) console.log(`  - ${c.name} (${c.id})`);

    const page1Ids = (page1.categories || []).map((c: any) => c.id);
    const page2Ids = (page2.categories || []).map((c: any) => c.id);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    console.log(`Overlap: ${overlap.length} (should be 0)`);
    if (overlap.length === 0) console.log('QUERY CURSOR PAGING WORKS!');
    else console.error('QUERY CURSOR PAGING BROKEN');
}

async function main() {
    console.log('Wix REST API Exploration — Server Side (ApiKeyStrategy)');
    console.log('Using @wix/sdk for auth only, REST calls via fetch()');

    await testCategoriesQueryCursorPaging();
    await testCategoriesSearchPaging();

    console.log('\n=== Done ===');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});

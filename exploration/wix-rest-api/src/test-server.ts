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

    console.log(`Found ${result.products?.length} products`);
    for (const product of (result.products || []).slice(0, 3)) {
        console.log(`  - ${product.name} (${product.slug})`);
        console.log(`    Price: ${product.priceData?.formatted?.price}`);
        console.log(`    Media: ${product.media?.items?.[0]?.image?.url?.substring(0, 60)}...`);
        console.log(`    Fields: ${Object.keys(product).join(', ')}`);
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

    const product = result.products?.[0];
    if (product) {
        console.log(`Found: ${product.name}`);
        console.log(`  ID: ${product._id}`);
        console.log(`  Options: ${product.productOptions?.length || 0}`);
        console.log(`  Variants: ${product.variants?.length || 0}`);
        console.log(`  Top-level fields: ${Object.keys(product).join(', ')}`);
    } else {
        console.log('Product not found');
    }
}

async function main() {
    console.log('Wix REST API Exploration — Server Side (ApiKeyStrategy)');
    console.log('Using @wix/sdk for auth only, REST calls via fetch()');

    await testQueryProducts();
    await testQueryCategories();
    await testGetCurrentCart();
    await testProductBySlug();

    console.log('\n=== Done ===');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});

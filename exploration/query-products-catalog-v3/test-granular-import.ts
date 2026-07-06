/**
 * Test: Can we import individual functions from the Wix SDK
 * instead of entire module namespaces?
 *
 * Instead of:
 *   import { productsV3 } from '@wix/stores';
 *   const client = wixClient.use(productsV3);
 *
 * We try:
 *   import { getProduct, getProductBySlug } from '@wix/auto_sdk_stores_products-v-3';
 *   const client = wixClient.use({ getProduct, getProductBySlug });
 */

import { getClient } from './wix-client.js';
import { getProduct, getProductBySlug, queryProducts } from '@wix/auto_sdk_stores_products-v-3';

async function testGranularImport() {
    const wixClient = getClient();

    // Test 1: use() with individual functions wrapped in an object
    console.log('Test 1: wixClient.use({ getProduct, getProductBySlug, queryProducts })');
    try {
        const client = wixClient.use({ getProduct, getProductBySlug, queryProducts });
        console.log('  ✅ use() succeeded');
        console.log('  Available methods:', Object.keys(client));

        // Test 2: Call queryProducts first to get a real slug
        console.log('\nTest 2: Calling client.queryProducts()...');
        const result = await client.queryProducts({});
        const products = result.products ?? [];
        console.log(`  ✅ Got ${products.length} products`);

        // Test 3: Use a real slug from the query results
        if (products.length > 0) {
            const slug = products[0].slug;
            console.log(`\nTest 3: Calling client.getProductBySlug("${slug}")...`);
            const productResult = await client.getProductBySlug(slug!);
            console.log(`  ✅ Got product: "${productResult.product?.name}"`);
        }
    } catch (error: any) {
        console.log(`  ❌ Failed: ${error.message}`);
        if (error.stack) console.log(error.stack);
    }
}

testGranularImport();

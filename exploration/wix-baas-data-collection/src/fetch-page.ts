/**
 * Fetch a specific page's files from the data collection.
 * Simulates what BaaS would do on a lazy page load.
 *
 * Usage: npm run fetch -- <route-pattern>
 * Example: npm run fetch -- kitan/products/[category]/[slug]
 */

import { createWixDataClient, COLLECTION_ID } from './wix-client.js';

async function main() {
    const routePrefix = process.argv[2];
    if (!routePrefix) {
        console.log('Usage: npm run fetch -- <route-prefix>');
        console.log('Example: npm run fetch -- pre-rendered/kitan/products');
        process.exit(1);
    }

    const client = createWixDataClient();

    console.log(`Fetching files matching path prefix: "${routePrefix}"...`);
    const startTime = Date.now();

    const result = await client.items
        .query(COLLECTION_ID)
        .startsWith('path', routePrefix)
        .limit(100)
        .find();

    const elapsed = Date.now() - startTime;

    console.log(`Found ${result.items.length} items in ${elapsed}ms`);
    for (const item of result.items) {
        console.log(`  ${item.path} (${item.sizeBytes} bytes, ${item.category})`);
    }

    if (result.items.length > 0) {
        // Test fetching a single item by ID (simulating lazy load of one file)
        const singleStart = Date.now();
        const singleItem = await client.items.get(COLLECTION_ID, result.items[0]._id!);
        const singleElapsed = Date.now() - singleStart;
        console.log(`\nSingle item fetch: ${singleElapsed}ms`);
        console.log(`  Content length: ${singleItem?.content?.length ?? 0} chars`);
    }
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});

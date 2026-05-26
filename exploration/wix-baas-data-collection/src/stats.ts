/**
 * Query the collection for stats — how many items, total size, etc.
 */

import { createWixDataClient, COLLECTION_ID } from './wix-client.js';

async function main() {
    const client = createWixDataClient();

    console.log(`Querying collection "${COLLECTION_ID}"...\n`);

    const total = await client.items.count(COLLECTION_ID);
    console.log(`Total items: ${total}`);

    const eager = await client.items.query(COLLECTION_ID)
        .eq('category', 'eager')
        .limit(1)
        .find();
    console.log(`Eager items (via query count): checking...`);

    const eagerAll = await client.items.query(COLLECTION_ID)
        .eq('category', 'eager')
        .limit(500)
        .find();
    console.log(`Eager items: ${eagerAll.items.length}`);

    const lazyCount = total - eagerAll.items.length;
    console.log(`Lazy items: ${lazyCount}`);

    // Size stats
    let totalEagerSize = 0;
    for (const item of eagerAll.items) {
        totalEagerSize += item.sizeBytes || 0;
    }
    console.log(`\nEager total size: ${(totalEagerSize / 1024).toFixed(0)} KB`);

    // Sample lazy items
    const lazySample = await client.items.query(COLLECTION_ID)
        .eq('category', 'lazy')
        .limit(10)
        .find();
    console.log(`\nSample lazy items:`);
    for (const item of lazySample.items) {
        console.log(`  ${item.path} (${item.sizeBytes} bytes)`);
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});

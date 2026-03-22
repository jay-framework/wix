import { getClient } from "./wix-client.js";
import { productsV3 } from "@wix/stores";
import * as fs from 'fs';
import * as path from 'path';

interface ProductsResponse {
    products: any[];
    totalCount: number;
    pageSize: number;
    hasNext: boolean;
}

async function queryAllProducts() {
    console.log('🚀 Starting Wix Products Query (Catalog V3)...\n');
    
    try {
        // Create output directory
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Get Wix client
        const wixClient = getClient();
        const productsClient = wixClient.use(productsV3);
        
        // Query products with pagination
        let allProducts: any[] = [];
        let currentPage = 0;
        const pageSize = 100; // Wix API default/max page size
        
        console.log('📦 Fetching products...');
        
        let response = await productsClient
            .queryProducts({fields: ['CURRENCY', 'INFO_SECTION', 'PLAIN_DESCRIPTION', 'INFO_SECTION_PLAIN_DESCRIPTION',
                    'VARIANT_OPTION_CHOICE_NAMES', 'MEDIA_ITEMS_INFO', 'ALL_CATEGORIES_INFO', 'THUMBNAIL',
                    'INFO_SECTION_DESCRIPTION']})
            .limit(pageSize)
            .find();

        while (true) {
            if (response.items && response.items.length > 0) {
                allProducts = allProducts.concat(response.items);
                console.log(`   ✓ Fetched ${response.items.length} products (page ${currentPage + 1})`);
                console.log(`   Total so far: ${allProducts.length}`);
            }

            currentPage++;

            if (!response.hasNext()) {
                break;
            }

            // Safety check to avoid infinite loops
            if (currentPage > 1000) {
                console.warn('⚠️  Stopped after 1000 pages for safety');
                break;
            }

            response = await response.next();
        }
        
        console.log(`\n✅ Successfully fetched ${allProducts.length} products\n`);
        
        // Save all products to a single JSON file
        const allProductsPath = path.join(outputDir, 'all-products.json');
        fs.writeFileSync(allProductsPath, JSON.stringify(allProducts, null, 2));
        console.log(`📄 Saved all products to: ${allProductsPath}`);
        
        // Save individual product files
        console.log('\n📝 Saving individual product files...');
        const individualDir = path.join(outputDir, 'individual');
        if (!fs.existsSync(individualDir)) {
            fs.mkdirSync(individualDir, { recursive: true });
        }
        
        for (const product of allProducts) {
            const productId = product.id || 'unknown';
            const productName = product.name || 'unnamed';
            // Create safe filename
            const safeName = productName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = `${productId}_${safeName}.json`;
            const filepath = path.join(individualDir, filename);
            
            fs.writeFileSync(filepath, JSON.stringify(product, null, 2));
        }
        
        console.log(`   ✓ Saved ${allProducts.length} individual product files`);
        
        // Save summary
        const summary = {
            totalProducts: allProducts.length,
            fetchedAt: new Date().toISOString(),
            pages: currentPage,
            productIds: allProducts.map(p => p.id),
            productNames: allProducts.map(p => ({ id: p.id, name: p.name })),
        };
        
        const summaryPath = path.join(outputDir, 'summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        console.log(`📊 Saved summary to: ${summaryPath}`);
        
        console.log('\n✨ Done!\n');
        
        // Print sample of first product
        if (allProducts.length > 0) {
            console.log('📋 Sample product (first one):');
            console.log(JSON.stringify(allProducts[0], null, 2).substring(0, 500) + '...\n');
        }
        
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
queryAllProducts();


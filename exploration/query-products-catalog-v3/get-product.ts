import { getClient } from "./wix-client.js";
import { productsV3 } from "@wix/stores";
import * as fs from 'fs';
import * as path from 'path';

async function getProductsIndividually() {
    console.log('🔍 Fetching products individually using getProduct API...\n');
    
    try {
        // Read the summary file to get product IDs
        const summaryPath = path.join(process.cwd(), 'output', 'summary.json');
        if (!fs.existsSync(summaryPath)) {
            console.error('❌ Summary file not found. Please run query-products first.');
            process.exit(1);
        }
        
        // Read the all-products file to get actual product IDs
        const allProductsPath = path.join(process.cwd(), 'output', 'all-products.json');
        if (!fs.existsSync(allProductsPath)) {
            console.error('❌ All products file not found. Please run query-products first.');
            process.exit(1);
        }
        
        const allProducts = JSON.parse(fs.readFileSync(allProductsPath, 'utf-8'));
        const productIds = allProducts
            .map((p: any) => p._id)
            .filter((id: any) => id != null);
        
        if (productIds.length === 0) {
            console.error('❌ No product IDs found in the data.');
            process.exit(1);
        }
        
        console.log(`📋 Found ${productIds.length} product IDs to fetch\n`);
        
        // Create output directory
        const outputDir = path.join(process.cwd(), 'output', 'get-product');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Get Wix client
        const wixClient = getClient();
        const productsClient = wixClient.use(productsV3);
        
        // Fetch each product individually
        const fetchedProducts: any[] = [];
        const results: { id: string; name: string; status: 'success' | 'error'; error?: string }[] = [];
        
        for (let i = 0; i < productIds.length; i++) {
            const productId = productIds[i];
            console.log(`[${i + 1}/${productIds.length}] Fetching product: ${productId}`);
            
            try {
                const product = await productsClient.getProduct(productId);
                
                if (product) {
                    fetchedProducts.push(product);
                    
                    // Save individual product file
                    const productName = product.name || 'unnamed';
                    const safeName = productName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${productId}_${safeName}.json`;
                    const filepath = path.join(outputDir, filename);
                    
                    fs.writeFileSync(filepath, JSON.stringify(product, null, 2));
                    
                    results.push({
                        id: productId,
                        name: productName,
                        status: 'success'
                    });
                    
                    console.log(`   ✓ Successfully fetched: ${productName}`);
                } else {
                    results.push({
                        id: productId,
                        name: 'unknown',
                        status: 'error',
                        error: 'Product not found (returned null)'
                    });
                    console.log(`   ⚠️  Product not found: ${productId}`);
                }
            } catch (error: any) {
                results.push({
                    id: productId,
                    name: 'unknown',
                    status: 'error',
                    error: error.message || 'Unknown error'
                });
                console.log(`   ❌ Error fetching product: ${error.message}`);
            }
        }
        
        console.log(`\n✅ Completed fetching ${fetchedProducts.length} products using getProduct\n`);
        
        // Save all fetched products
        const allFetchedPath = path.join(outputDir, 'all-fetched-products.json');
        fs.writeFileSync(allFetchedPath, JSON.stringify(fetchedProducts, null, 2));
        console.log(`📄 Saved all fetched products to: ${allFetchedPath}`);
        
        // Save results summary
        const resultsSummary = {
            method: 'getProduct',
            totalAttempted: productIds.length,
            successful: results.filter(r => r.status === 'success').length,
            failed: results.filter(r => r.status === 'error').length,
            fetchedAt: new Date().toISOString(),
            results: results
        };
        
        const resultsSummaryPath = path.join(outputDir, 'fetch-summary.json');
        fs.writeFileSync(resultsSummaryPath, JSON.stringify(resultsSummary, null, 2));
        console.log(`📊 Saved fetch summary to: ${resultsSummaryPath}`);
        
        console.log('\n✨ Done!\n');
        
        // Print summary statistics
        console.log('📈 Summary:');
        console.log(`   Total products attempted: ${resultsSummary.totalAttempted}`);
        console.log(`   Successfully fetched: ${resultsSummary.successful}`);
        console.log(`   Failed: ${resultsSummary.failed}`);
        
        if (resultsSummary.failed > 0) {
            console.log('\n⚠️  Failed products:');
            results.filter(r => r.status === 'error').forEach(r => {
                console.log(`   - ${r.id}: ${r.error}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Run the function
getProductsIndividually();







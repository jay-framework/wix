import { getClient } from "./wix-client.js";
import { productsV3 } from "@wix/stores";
import * as fs from 'fs';
import * as path from 'path';

async function getProductsBySlug() {
    console.log('🔍 Fetching products individually using getProductBySlug API...\n');
    
    try {
        // Read the all-products file to get product slugs
        const allProductsPath = path.join(process.cwd(), 'output', 'all-products.json');
        if (!fs.existsSync(allProductsPath)) {
            console.error('❌ All products file not found. Please run query-products first.');
            process.exit(1);
        }
        
        const allProducts = JSON.parse(fs.readFileSync(allProductsPath, 'utf-8'));
        const productSlugs = allProducts
            .map((p: any) => ({ id: p._id, slug: p.slug, name: p.name }))
            .filter((p: any) => p.slug != null);
        
        if (productSlugs.length === 0) {
            console.error('❌ No product slugs found in the data.');
            process.exit(1);
        }
        
        console.log(`📋 Found ${productSlugs.length} product slugs to fetch\n`);
        
        // Create output directory
        const outputDir = path.join(process.cwd(), 'output', 'get-product-by-slug');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Get Wix client
        const wixClient = getClient();
        const productsClient = wixClient.use(productsV3);
        
        // Fetch each product individually by slug
        const fetchedProducts: any[] = [];
        const results: { 
            id: string; 
            slug: string; 
            name: string; 
            status: 'success' | 'error'; 
            error?: string 
        }[] = [];
        
        for (let i = 0; i < productSlugs.length; i++) {
            const { id, slug, name } = productSlugs[i];
            console.log(`[${i + 1}/${productSlugs.length}] Fetching product by slug: "${slug}"`);
            
            try {
                const response = await productsClient.getProductBySlug(slug);
                
                if (response) {
                    // getProductBySlug returns { product: {...} } while getProduct returns the product directly
                    const productData = (response as any).product || response;
                    fetchedProducts.push(productData);
                    
                    // Save individual product file
                    const productName = productData.name || 'unnamed';
                    const safeName = productName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${slug}_${safeName}.json`;
                    const filepath = path.join(outputDir, filename);
                    
                    fs.writeFileSync(filepath, JSON.stringify(productData, null, 2));
                    
                    results.push({
                        id: id,
                        slug: slug,
                        name: productName,
                        status: 'success'
                    });
                    
                    console.log(`   ✓ Successfully fetched: ${productName}`);
                } else {
                    results.push({
                        id: id,
                        slug: slug,
                        name: name || 'unknown',
                        status: 'error',
                        error: 'Product not found (returned null)'
                    });
                    console.log(`   ⚠️  Product not found: ${slug}`);
                }
            } catch (error: any) {
                results.push({
                    id: id,
                    slug: slug,
                    name: name || 'unknown',
                    status: 'error',
                    error: error.message || 'Unknown error'
                });
                console.log(`   ❌ Error fetching product: ${error.message}`);
            }
        }
        
        console.log(`\n✅ Completed fetching ${fetchedProducts.length} products using getProductBySlug\n`);
        
        // Save all fetched products
        const allFetchedPath = path.join(outputDir, 'all-fetched-products.json');
        fs.writeFileSync(allFetchedPath, JSON.stringify(fetchedProducts, null, 2));
        console.log(`📄 Saved all fetched products to: ${allFetchedPath}`);
        
        // Save results summary
        const resultsSummary = {
            method: 'getProductBySlug',
            totalAttempted: productSlugs.length,
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
                console.log(`   - ${r.slug} (${r.id}): ${r.error}`);
            });
        }
        
        // Compare with original data
        console.log('\n🔬 Comparison Analysis:');
        console.log('   Comparing fetched products with original queryProducts data...');
        
        let matchCount = 0;
        let mismatchDetails: string[] = [];
        
        for (const result of results) {
            if (result.status === 'success') {
                const fetchedProduct = fetchedProducts.find(p => p._id === result.id);
                const originalProduct = allProducts.find((p: any) => p._id === result.id);
                
                if (fetchedProduct && originalProduct) {
                    // Check if key fields match
                    const fieldsMatch = 
                        fetchedProduct._id === originalProduct._id &&
                        fetchedProduct.name === originalProduct.name &&
                        fetchedProduct.slug === originalProduct.slug;
                    
                    if (fieldsMatch) {
                        matchCount++;
                    } else {
                        mismatchDetails.push(`   - ${result.slug}: Fields don't match`);
                    }
                }
            }
        }
        
        console.log(`   Products matching original data: ${matchCount}/${results.length}`);
        if (mismatchDetails.length > 0) {
            console.log('\n   Mismatches found:');
            mismatchDetails.forEach(detail => console.log(detail));
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
getProductsBySlug();


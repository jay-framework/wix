import { getClient } from "./wix-client.js";
import { categories } from "@wix/categories";
import * as fs from 'fs';
import * as path from 'path';

interface CategoryNode {
    id: string;
    name: string;
    itemCount: number;
    children: CategoryNode[];
}

async function queryCategories() {
    console.log('Starting Wix Categories Query (Catalog V3)...\n');

    try {
        const wixClient = getClient();
        const categoriesClient = wixClient.use(categories);

        // Fetch all categories (paginated)
        let allCategories: any[] = [];
        let response = await categoriesClient.queryCategories({
            treeReference: { appNamespace: '@wix/stores' }
        })
            .eq('visible', true)
            .limit(100)
            .find();

        while (true) {
            if (response.items && response.items.length > 0) {
                allCategories = allCategories.concat(response.items);
            }
            if (!response.hasNext()) break;
            response = await response.next();
        }

        console.log(`Fetched ${allCategories.length} categories\n`);

        // Build tree
        const nodeMap = new Map<string, CategoryNode>();
        const roots: CategoryNode[] = [];

        for (const cat of allCategories) {
            nodeMap.set(cat._id!, {
                id: cat._id!,
                name: cat.name || '(unnamed)',
                itemCount: cat.itemCounter ?? 0,
                children: [],
            });
        }

        for (const cat of allCategories) {
            const node = nodeMap.get(cat._id!)!;
            const parentId = cat.parentCategory?._id;
            if (parentId && nodeMap.has(parentId)) {
                nodeMap.get(parentId)!.children.push(node);
            } else {
                roots.push(node);
            }
        }

        // Build ASCII tree string
        const lines: string[] = [];
        function buildTree(node: CategoryNode, prefix: string, isLast: boolean) {
            const connector = isLast ? '└── ' : '├── ';
            lines.push(`${prefix}${connector}${node.name} [${node.itemCount}] (${node.id})`);
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            for (let i = 0; i < node.children.length; i++) {
                buildTree(node.children[i], childPrefix, i === node.children.length - 1);
            }
        }

        for (let i = 0; i < roots.length; i++) {
            buildTree(roots[i], '', i === roots.length - 1);
        }

        const tree = lines.join('\n');
        console.log(tree);

        // Write to files
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const txtPath = path.join(outputDir, 'categories-tree.txt');
        fs.writeFileSync(txtPath, tree + '\n');
        console.log(`\nSaved to: ${txtPath}`);

        // Write HTML
        function buildHtmlTree(nodes: CategoryNode[]): string {
            if (nodes.length === 0) return '';
            let html = '<ul>\n';
            for (const node of nodes) {
                html += `<li><span class="node"><strong>${node.name}</strong> <span class="count">[${node.itemCount}]</span> <code>${node.id}</code></span>`;
                if (node.children.length > 0) {
                    html += '\n' + buildHtmlTree(node.children);
                }
                html += '</li>\n';
            }
            html += '</ul>\n';
            return html;
        }

        const htmlContent = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Categories Tree</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #fafafa; }
  h1 { color: #333; }
  ul { list-style: none; padding-right: 0; margin: 0.2rem 0 0.2rem 0; }
  li { position: relative; padding-right: 1.5rem; margin: 0; }
  li::before {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    width: 1rem;
    height: 0.85em;
    border-right: 2px solid #999;
    border-bottom: 2px solid #999;
    border-bottom-right-radius: 4px;
  }
  li::after {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    border-right: 2px solid #999;
  }
  li:last-child::after { display: none; }
  body > ul > li { padding-right: 0; }
  body > ul > li::before, body > ul > li::after { display: none; }
  .node { display: inline-block; padding: 0.25rem 0.5rem; margin: 0.2rem 0; background: #fff; border: 1px solid #e0e0e0; border-radius: 4px; }
  .node strong { color: #1a1a1a; }
  .count { color: #0066cc; font-size: 0.9em; margin: 0 0.3rem; }
  code { color: #888; font-size: 0.75em; margin-right: 0.5rem; }
  .meta { color: #666; margin-bottom: 1.5rem; }
</style>
</head>
<body>
<h1>Categories Tree</h1>
<p class="meta">Total categories: ${allCategories.length} | Generated: ${new Date().toISOString()}</p>
${buildHtmlTree(roots)}
</body>
</html>`;

        const htmlPath = path.join(outputDir, 'categories-tree.html');
        fs.writeFileSync(htmlPath, htmlContent);
        console.log(`Saved to: ${htmlPath}`);

    } catch (error) {
        console.error('Error querying categories:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

queryCategories();

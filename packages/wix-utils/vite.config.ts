import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            // `sanitize-catalog-html` is a separate, server-only entry (`@jay-framework/wix-utils/sanitize`)
            // so `sanitize-html` never reaches client bundles that import the main entry.
            entry: {
                index: resolve(__dirname, 'lib/index.ts'),
                'sanitize-catalog-html': resolve(__dirname, 'lib/sanitize-catalog-html.ts'),
            },
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.js`,
        },
        rollupOptions: {
            external: ['sanitize-html', 'entities'],
        },
        minify: false,
    },
});

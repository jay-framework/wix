import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'lib/index.ts'),
                'index.client': resolve(__dirname, 'lib/index.client.ts'),
            },
            formats: ['es'],
            fileName: (_format, entryName) =>
                entryName === 'index.client' ? 'index.client.js' : 'index.js',
        },
        rollupOptions: {
            external: [],
        },
        minify: false,
    },
});

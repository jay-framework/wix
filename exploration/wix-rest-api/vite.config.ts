import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: 'src',
    server: { port: 3002, open: '/test-sdk-calls.html' },
    build: {
        outDir: '../dist',
        rollupOptions: {
            input: { main: resolve(__dirname, 'src/index.html') },
        },
    },
});

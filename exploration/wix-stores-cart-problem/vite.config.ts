import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: 'src',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'src/index.html'),
                debug: resolve(__dirname, 'src/debug.html'),
            },
        },
    },
    server: {
        port: 3000,
        open: '/debug.html',  // Open debug page by default
    },
});

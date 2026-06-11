import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: 'src',
    server: { port: 3002, open: true },
    build: {
        outDir: '../dist',
        rollupOptions: {
            input: { main: resolve(__dirname, 'src/index.html') },
        },
    },
});

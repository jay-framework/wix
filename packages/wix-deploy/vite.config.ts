import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2022',
        ssr: true,
        emptyOutDir: false,
        lib: {
            entry: {
                index: resolve(__dirname, 'lib/index.ts'),
                'artifact-store': resolve(__dirname, 'lib/artifact-store.ts'),
            },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/fullstack-component',
                '@jay-framework/production-server',
                '@jay-framework/production-server/serve',
                '@jay-framework/stack-server-runtime',
                '@jay-framework/wix-server-client',
                '@wix/sdk',
                '@wix/data',
                'esbuild',
                'js-yaml',
                /^node:/,
            ],
        },
    },
});

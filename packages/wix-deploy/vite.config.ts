import { resolve } from 'path';
import { defineConfig } from 'vite';

// Packages that consumers install from public npm — kept as external imports
const publicDeps = [
    '@jay-framework/compiler-jay-html',
    '@jay-framework/compiler-shared',
    '@jay-framework/fullstack-component',
    '@jay-framework/production-server',
    '@jay-framework/production-server/serve',
    '@jay-framework/stack-server-runtime',
    '@jay-framework/wix-server-client',
    '@wix/sdk',
    '@wix/data',
    'esbuild',
    'js-yaml',
];

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
                'wix-pages-manifest': resolve(__dirname, 'lib/wix-pages-manifest.ts'),
            },
            formats: ['es'],
        },
        rollupOptions: {
            external: [...publicDeps, /^node:/],
        },
    },
    ssr: {
        noExternal: true,
        external: publicDeps,
    },
});

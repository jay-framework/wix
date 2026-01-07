import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build/jay-runtime',
};

export default defineConfig(({ isSsrBuild }) => ({
    plugins: [...jayStackCompiler(jayOptions)],
    build: {
        minify: false,
        target: 'es2020',
        ssr: isSsrBuild,
        emptyOutDir: false,
        lib: {
            // Same entry point - environment is detected from build.ssr / options.ssr
            entry: isSsrBuild
                ? { index: resolve(__dirname, 'lib/index.ts') }
                : { 'index.client': resolve(__dirname, 'lib/index.client.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/fullstack-component',
                '@jay-framework/stack-client-runtime', // For action callers in client bundle
                '@jay-framework/stack-server-runtime',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                '@jay-framework/json-patch',
                '@jay-framework/secure',
                '@jay-framework/wix-server-client',
                '@jay-framework/wix-server-client/client',
                '@wix/stores',
                '@wix/ecom',
            ],
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
    },
}));



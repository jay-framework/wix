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
            // Different entry points for server vs client
            entry: isSsrBuild
                ? { index: resolve(__dirname, 'lib/index.ts') }
                : { 'index.client': resolve(__dirname, 'lib/index.client.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/component',
                '@jay-framework/fullstack-component',
                '@jay-framework/stack-client-runtime',
                '@jay-framework/stack-server-runtime',
                '@jay-framework/reactive',
                '@jay-framework/runtime',
                '@jay-framework/secure',
                '@wix/sdk',
                'fs',
                'path',
                'js-yaml',
            ],
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
    },
}));

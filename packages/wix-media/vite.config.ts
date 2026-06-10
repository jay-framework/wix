import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'build',
};

export default defineConfig({
    plugins: [...jayStackCompiler(jayOptions)],
    build: {
        minify: false,
        target: 'es2020',
        ssr: true,
        emptyOutDir: false,
        lib: {
            entry: { index: resolve(__dirname, 'lib/index.ts') },
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/compiler-shared',
                '@jay-framework/compiler-jay-html',
                '@jay-framework/component',
                '@jay-framework/fullstack-component',
                '@jay-framework/stack-server-runtime',
                '@jay-framework/wix-server-client',
                '@jay-framework/wix-server-client/client',
                '@jay-framework/wix-utils',
                '@wix/sdk',
                '@wix/media',
            ],
        },
    },
    test: {
        globals: true,
    },
});

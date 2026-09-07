// @vitest-environment node

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveFormBaseContractPath } from '../lib/utils/resolve-form-base-contract-path.js';

describe('resolveFormBaseContractPath', () => {
    it('should resolve from lib/generators module path', () => {
        const generatorModuleUrl = pathToFileURL(
            join(import.meta.dirname, '../lib/generators/form-contract-generator.ts'),
        ).href;

        const resolvedPath = resolveFormBaseContractPath(generatorModuleUrl);

        expect(resolvedPath).toEqual(
            join(import.meta.dirname, '../lib/contracts/wix-form-base.jay-contract'),
        );
    });

    it('should resolve from bundled dist/index.js module path', () => {
        const distIndexPath = join(import.meta.dirname, '../dist/index.js');
        if (!existsSync(distIndexPath)) {
            return;
        }

        const resolvedPath = resolveFormBaseContractPath(pathToFileURL(distIndexPath).href);

        expect(resolvedPath).toEqual(
            join(import.meta.dirname, '../dist/contracts/wix-form-base.jay-contract'),
        );
    });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_CONTRACT_FILE = 'wix-form-base.jay-contract';

/**
 * Resolve wix-form-base.jay-contract for contract materialization.
 *
 * - Source/tests: lib/generators/*.ts → lib/contracts/
 * - Published/synced bundle: dist/index.js → dist/contracts/
 */
export function resolveFormBaseContractPath(moduleUrl: string): string {
    const moduleDir = path.dirname(fileURLToPath(moduleUrl));
    const candidates = [
        path.join(moduleDir, 'contracts', BASE_CONTRACT_FILE),
        path.join(moduleDir, '../contracts', BASE_CONTRACT_FILE),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        `${BASE_CONTRACT_FILE} not found. Tried:\n${candidates.map((candidate) => `  - ${candidate}`).join('\n')}`,
    );
}

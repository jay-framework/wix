// @vitest-environment node

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWixFormsConfig } from '../lib/config-loader.js';

/**
 * Bug: a site could not say which country local phone numbers belong to (DL#55 P1c, Q30), and a
 *   bad value would make every local phone fail quietly.
 * Found in: design-log/55 - wix validation parity for wix-forms.md §1c "Config (P1c-a)"
 * Expected: `defaultPhoneCountry` is trimmed and upper-cased; an unsupported value fails init loudly.
 */

function projectWithConfig(yamlText: string): string {
    const root = mkdtempSync(join(tmpdir(), 'wix-forms-config-'));
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config', '.wix-forms.yaml'), yamlText);
    return root;
}

describe('loadWixFormsConfig defaultPhoneCountry (DL#55 P1c)', () => {
    it('should upper-case a supported country code', () => {
        const root = projectWithConfig('defaultPhoneCountry: " il "\n');
        expect(loadWixFormsConfig(root).defaultPhoneCountry).toBe('IL');
    });

    it('should leave it undefined when absent', () => {
        const root = projectWithConfig('include: enabled\n');
        expect(loadWixFormsConfig(root).defaultPhoneCountry).toBeUndefined();
    });

    it.each(['XX', 'Israel'])(
        'should refuse "%s" with a message naming the file and key',
        (value) => {
            const root = projectWithConfig(`defaultPhoneCountry: ${value}\n`);
            expect(() => loadWixFormsConfig(root)).toThrow(
                `config/.wix-forms.yaml: defaultPhoneCountry "${value.toUpperCase()}" is not a country code libphonenumber-js supports (use an ISO 3166-1 alpha-2 code, e.g. IL, US, GB). Fix or remove the key.`,
            );
        },
    );
});

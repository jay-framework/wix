// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    contractNameToKebab,
    formContractName,
    toPascalCase,
} from '../lib/utils/form-contract-name.js';

describe('toPascalCase', () => {
    it('should convert spaced and dashed titles to PascalCase', () => {
        expect(toPascalCase('contact us')).toBe('ContactUs');
        expect(toPascalCase('newsletter-signup')).toBe('NewsletterSignup');
    });
});

describe('formContractName', () => {
    it('should sanitize unicode and special characters', () => {
        const usedNames = new Set<string>();
        expect(formContractName('id-1', 'Contact — Us!!!', usedNames)).toBe('ContactUsForm');
    });

    it('should fall back to Form when title is empty', () => {
        const usedNames = new Set<string>();
        expect(formContractName('id-1', '', usedNames)).toBe('FormForm');
    });

    it('should append formId suffix on duplicate titles', () => {
        const usedNames = new Set<string>();
        const first = formContractName('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Contact us', usedNames);
        const second = formContractName('fedcba98-7654-3210-fedc-ba9876543210', 'Contact us', usedNames);
        expect(first).toBe('ContactUsForm');
        expect(second).toBe('ContactUsForm_fedcba98');
    });
});

describe('contractNameToKebab', () => {
    it('should convert PascalCase contract names for dynamic contract keys', () => {
        expect(contractNameToKebab('ContactUsForm')).toBe('contact-us-form');
        expect(contractNameToKebab('ContactUsForm_a1b2c3d4')).toBe('contact-us-form_a1b2c3d4');
    });
});

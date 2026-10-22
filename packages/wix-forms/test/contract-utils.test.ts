import { describe, it, expect } from 'vitest';
import { contractTagName } from '../lib/generators/contract-utils.js';

/**
 * Bug: Break B — generated contract tags used the raw Wix field `target`
 *   (snake_case / kebab-case), but jay camelCases every contract tag into the
 *   compiled ViewState accessor and the ref name. So a field `first_name`
 *   produced the tag `first_name` while the page bound `{form.firstName.label}`
 *   and `ref="form.firstName.input"` → fields rendered `undefined` and their
 *   values were never read on submit.
 * Found in: design-log/38 - per-form contracts for wix-forms.md (Implementation Results)
 * Expected: contractTagName camelCases the target to match jay's accessor/ref
 *   convention (preserving leading underscores, as jay's camelCase does), then
 *   suffixes with `Field` only when the camelCased name collides with a
 *   reserved form-level tag.
 * Actual (pre-fix): contractTagName returns the raw target unchanged.
 */
describe('contractTagName', () => {
    it('should camelCase a snake_case target', () => {
        expect(contractTagName('first_name')).toBe('firstName');
    });

    it('should camelCase a kebab-case target', () => {
        expect(contractTagName('phone-number')).toBe('phoneNumber');
    });

    it('should leave an already-camelCase target unchanged', () => {
        expect(contractTagName('email')).toBe('email');
    });

    it('should preserve leading underscores, matching jay camelCase', () => {
        expect(contractTagName('_internal_ref')).toBe('_internalRef');
    });

    it('should suffix a target that collides with a reserved tag after camelCasing', () => {
        // `is_loading` camelCases to the reserved `isLoading`, so it must be
        // suffixed to stay distinct from the reserved form-level tag.
        expect(contractTagName('is_loading')).toBe('isLoadingField');
    });

    it('should suffix a target already equal to a reserved tag', () => {
        expect(contractTagName('submitButton')).toBe('submitButtonField');
    });
});

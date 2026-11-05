// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { computeFormSlugs } from '../lib/generators/form-slug.js';

describe('computeFormSlugs', () => {
    it('should kebab-case a unique form name into a bare slug', () => {
        const slugs = computeFormSlugs([{ id: 'a', name: 'Contact Us' }]);
        expect(slugs.get('a')).toEqual('contact-us');
    });

    it('should suffix EVERY colliding form with a prefix of its own id (none left bare)', () => {
        const slugs = computeFormSlugs([
            { id: 'a1b2c3d4', name: 'Contact' },
            { id: '9f3c7e21', name: 'Contact' },
        ]);
        expect(slugs.get('a1b2c3d4')).toEqual('contact-a1b2');
        expect(slugs.get('9f3c7e21')).toEqual('contact-9f3c');
    });

    it('should be independent of input order', () => {
        const forms = [
            { id: 'a1b2c3d4', name: 'Contact' },
            { id: '9f3c7e21', name: 'Contact' },
        ];
        const forward = computeFormSlugs(forms);
        const reversed = computeFormSlugs([...forms].reverse());
        expect(reversed.get('a1b2c3d4')).toEqual(forward.get('a1b2c3d4'));
        expect(reversed.get('9f3c7e21')).toEqual(forward.get('9f3c7e21'));
    });

    it('should grow the suffix until colliding ids are distinct', () => {
        const slugs = computeFormSlugs([
            { id: 'abcd-1111', name: 'Contact' },
            { id: 'abcd-2222', name: 'Contact' },
        ]);
        // First 4 normalized chars ("abcd") collide → suffix grows to stay distinct.
        expect(slugs.get('abcd-1111')).not.toEqual(slugs.get('abcd-2222'));
        expect(slugs.get('abcd-1111')?.startsWith('contact-')).toBe(true);
    });

    it('should fall back to a kebab id slug when the name is empty', () => {
        const slugs = computeFormSlugs([{ id: 'AB-12', name: '' }]);
        expect(slugs.get('AB-12')).toEqual('ab-12');
    });
});

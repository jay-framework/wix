import { describe, expect, it } from 'vitest';
import {
    createLearnedAddressFacts,
    LEARNED_FACT_TTL_MS,
} from '../../lib/address/learned-address-facts.js';
import { IT_CODES } from '../support/address-fixtures.js';

function clock() {
    let time = 0;
    return { now: () => time, advance: (by: number) => (time += by) };
}

describe('A10: LearnedAddressFacts', () => {
    it('keeps a learned list upper-cased and de-duplicated', () => {
        const facts = createLearnedAddressFacts();
        facts.learnSubdivisions('IT', [...IT_CODES, '21']);
        expect(facts.subdivisionsOf('IT')).toEqual(IT_CODES);
        facts.learnSubdivisions('FR', ['idf', 'IDF']);
        expect(facts.subdivisionsOf('FR')).toEqual(['IDF']);
    });

    it('ignores a country Wix does not accept, a malformed code, and more than 200 codes', () => {
        const facts = createLearnedAddressFacts();
        facts.learnSubdivisions('ZZ', ['A1']);
        facts.learnSubdivisions('IT', ['21', 'TOOLONG']);
        facts.learnSubdivisions(
            'ES',
            Array.from({ length: 201 }, (_unused, index) => `${index}`),
        );
        expect([
            facts.subdivisionsOf('ZZ'),
            facts.subdivisionsOf('IT'),
            facts.subdivisionsOf('ES'),
        ]).toEqual([undefined, undefined, undefined]);
    });

    it('expires an entry 1 h after its write, and removes it', () => {
        const time = clock();
        const facts = createLearnedAddressFacts({ now: time.now });
        facts.learnSubdivisions('IT', IT_CODES);
        time.advance(LEARNED_FACT_TTL_MS - 1);
        expect(facts.subdivisionsOf('IT')).toEqual(IT_CODES);
        time.advance(1);
        expect(facts.subdivisionsOf('IT')).toBeUndefined();
        expect(facts.snapshot()).toEqual({});
    });

    it('reveals only layout parts', () => {
        const facts = createLearnedAddressFacts();
        facts.revealPart('ZW', 'subdivision');
        facts.revealPart('ZW', 'state' as any);
        expect(facts.revealedPartsOf('ZW')).toEqual(['subdivision']);
        expect(facts.revealedPartsOf('IT')).toEqual([]);
    });

    /** Review round 3, m3: labels reach the factory, so snapshot() can name learned codes. */
    it('snapshots the unexpired facts, labelling codes by config or by code', () => {
        const facts = createLearnedAddressFacts({
            labels: { subdivisions: { IT: { '25': 'Lombardia' } } },
        });
        facts.learnSubdivisions('IT', ['21', '25']);
        facts.revealPart('ZW', 'subdivision');
        expect(facts.snapshot()).toEqual({
            subdivisionsOf: {
                IT: [
                    { value: '21', label: '21' },
                    { value: '25', label: 'Lombardia' },
                ],
            },
            revealedPartsOf: { ZW: ['subdivision'] },
        });
    });
});

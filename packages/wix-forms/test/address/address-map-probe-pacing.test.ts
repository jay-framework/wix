// @vitest-environment node

/** DL #52 L12: the probe's token rotation, backoff and resume (Implementation Results). */

import { describe, expect, it } from 'vitest';
import {
    createTokenRotation,
    pendingCountries,
    PROBE_SPACING_MS,
    PROBES_PER_TOKEN,
    retryDelayMs,
} from '../../scripts/address-map-probe-pacing.mjs';

describe('address-map-probe pacing', () => {
    it('mints a new visitor token every 90 probes, below the ~100 Wix allows per token', async () => {
        let minted = 0;
        const rotation = createTokenRotation({ mint: async () => `token-${(minted += 1)}` });
        const tokens: string[] = [];
        for (let probe = 0; probe < 2 * PROBES_PER_TOKEN + 1; probe += 1) {
            tokens.push(await rotation.authorizationForNextProbe());
        }
        expect(PROBES_PER_TOKEN).toBe(90);
        expect(tokens[0]).toBe('token-1');
        expect(tokens[89]).toBe('token-1');
        expect(tokens[90]).toBe('token-2');
        expect(tokens[180]).toBe('token-3');
    });

    it('spaces probes 2.5 s apart and backs off exponentially, capped at 16x', () => {
        expect(PROBE_SPACING_MS).toBe(2500);
        expect([0, 1, 2, 3, 9].map((attempt) => retryDelayMs(attempt))).toEqual([
            5000, 10000, 20000, 40000, 40000,
        ]);
    });

    it('resumes with only the countries not probed yet, in order', () => {
        expect(pendingCountries(['AD', 'AE', 'AF', 'AG'], { AD: {}, AF: {} })).toEqual([
            'AE',
            'AG',
        ]);
        expect(pendingCountries(['AD'])).toEqual(['AD']);
    });
});

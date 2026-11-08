// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createSubmitFlight } from '../lib/components/form-submit-flight.js';

describe('createSubmitFlight', () => {
    it('should drop a result when invalidate ran before the response arrived', () => {
        const flight = createSubmitFlight();
        const generation = flight.begin();
        flight.invalidate();
        expect(flight.isCurrent(generation)).toBe(false);
    });
});

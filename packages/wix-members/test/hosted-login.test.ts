import { describe, expect, it } from 'vitest';
import { hostedLoginOptions } from '../lib/utils/hosted-login';

describe('hosted login', () => {
    it("goes straight to a social provider's sign-in, or to Wix's Log In page without one", () => {
        expect(hostedLoginOptions('google')).toEqual({ prompt: 'login', responseMode: 'query', idp: 'google' });
        expect(hostedLoginOptions()).toEqual({ prompt: 'login', responseMode: 'query' });
    });
});

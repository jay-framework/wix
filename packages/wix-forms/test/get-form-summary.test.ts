import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WixClient } from '@wix/sdk';

const wixFetch = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@jay-framework/wix-server-client', () => ({ wixFetch }));

import { getFormSummary } from '../lib/wix-apis/get-form-summary';

const client = {} as WixClient;

beforeEach(() => {
    wixFetch.mockClear();
});

describe('getFormSummary path safety (DL#49)', () => {
    it('rejects a traversal form id without calling Wix', async () => {
        await expect(getFormSummary(client, '../../../members/v1/members?x=1#')).rejects.toThrow(
            'Form ID is not a valid Wix form id.',
        );
        expect(wixFetch).not.toHaveBeenCalled();
    });

    it('requests the lowercase GUID path for an upper-case GUID', async () => {
        await getFormSummary(client, '3F2A9C1E-5B7D-4E8F-9A0B-1C2D3E4F5A6B');
        expect(wixFetch).toHaveBeenCalledWith(
            client,
            '/form-schema-service/v4/forms/3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b/summary',
            { method: 'GET' },
        );
    });
});

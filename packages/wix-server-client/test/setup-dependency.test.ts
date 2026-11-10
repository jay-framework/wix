import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', () => ({ hasService: vi.fn() }));

import { hasService } from '@jay-framework/stack-server-runtime';
import {
    SERVER_CLIENT_NOT_CONFIGURED_MESSAGE,
    serverClientSetupBlocker,
} from '../lib/setup-dependency';

describe('serverClientSetupBlocker', () => {
    afterEach(() => vi.mocked(hasService).mockReset());

    it('should skip with the real cause when no Wix client is registered', () => {
        vi.mocked(hasService).mockReturnValue(false);
        const symptom = new Error("Service 'jay:service:WixClientService' not found.");
        expect(serverClientSetupBlocker(symptom)).toEqual({
            status: 'needs-config',
            message: SERVER_CLIENT_NOT_CONFIGURED_MESSAGE,
        });
    });

    it('should report the plugin init error when the client exists', () => {
        vi.mocked(hasService).mockReturnValue(true);
        expect(serverClientSetupBlocker(new Error('boom'))).toEqual({
            status: 'error',
            message: 'Service init failed: boom',
        });
        expect(serverClientSetupBlocker(undefined)).toBeUndefined();
    });
});

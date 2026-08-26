// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/wix-server-client', () => ({
    wixFetch: vi.fn(),
}));

import { wixFetch } from '@jay-framework/wix-server-client';
import { queryBookingServices } from '../lib/wix-apis/query-services.js';

const mockWixFetch = vi.mocked(wixFetch);
const mockClient = {} as Parameters<typeof queryBookingServices>[0];

describe('queryBookingServices', () => {
    beforeEach(() => {
        mockWixFetch.mockReset();
    });

    it('should fetch all pages when Wix returns a full page of services', async () => {
        const firstPage = Array.from({ length: 100 }, (_, index) => ({
            _id: `svc-${index}`,
            name: `Service ${index}`,
        }));
        mockWixFetch.mockResolvedValueOnce({ services: firstPage }).mockResolvedValueOnce({
            services: [{ _id: 'svc-100', name: 'Service 100' }],
        });

        const services = await queryBookingServices(mockClient, 'app-1');

        expect(mockWixFetch).toHaveBeenCalledTimes(2);
        expect(services).toHaveLength(101);
        expect(mockWixFetch.mock.calls[1]?.[2]).toMatchObject({
            body: {
                query: {
                    paging: { limit: 100, offset: 100 },
                },
            },
        });
    });

    it('should stop after the first page when fewer than 100 services are returned', async () => {
        mockWixFetch.mockResolvedValueOnce({
            services: [{ _id: 'svc-1', name: 'Consultation' }],
        });

        const services = await queryBookingServices(mockClient, 'app-1');

        expect(mockWixFetch).toHaveBeenCalledTimes(1);
        expect(services).toHaveLength(1);
    });
});

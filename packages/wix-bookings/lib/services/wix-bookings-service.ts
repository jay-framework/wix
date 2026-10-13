import type { WixClient } from '@wix/sdk';
import { registerService } from '@jay-framework/stack-server-runtime';
import type { WixBookingsConfig } from '../config-loader.js';
import { WIX_BOOKINGS_SERVICE, type WixBookingsService } from './wix-bookings-service-marker.js';
import { createWixBookingsService } from './create-wix-bookings-service.js';

export function provideWixBookingsService(
    wixClient: WixClient,
    config: WixBookingsConfig,
): WixBookingsService {
    const service = createWixBookingsService(wixClient, config);
    registerService(WIX_BOOKINGS_SERVICE, service);
    return service;
}

export { WIX_BOOKINGS_SERVICE, type WixBookingsService } from './wix-bookings-service-marker.js';

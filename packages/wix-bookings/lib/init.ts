import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[wix-bookings] Initializing server-side bookings service...');
        const { loadWixBookingsConfig } = await import('./config-loader.js');
        const { provideWixBookingsService } = await import('./services/wix-bookings-service.js');
        const wixClient = getService(WIX_CLIENT_SERVICE);
        const config = loadWixBookingsConfig(process.cwd());
        provideWixBookingsService(wixClient, config);
        console.log(`[wix-bookings] Booking app ID: ${config.bookingAppId}`);
        console.log('[wix-bookings] Server initialization complete');
        return {};
    })
    .withClient(async () => {
        console.log('[wix-bookings] Client ready (no client context required)');
    });

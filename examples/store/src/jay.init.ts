/**
 * Service initialization for the fake-shop example.
 *
 * This file is loaded by the dev-server on startup and registers
 * all services that pages can use via dependency injection.
 */

import {
    onInit,
    onShutdown,
} from '@jay-framework/stack-server-runtime';
import {
    getWixClient
} from '@jay-framework/wix-server-client'
import {provideWixStoresService} from "@jay-framework/wix-stores";

onInit(async () => {
    console.log('[Fake Shop] Initializing services...');
    const wixClient = getWixClient();
    provideWixStoresService(wixClient);
    console.log('[Fake Shop] Services initialized successfully!!!!');
});

onShutdown(async () => {
    console.log('[Fake Shop] Shutting down services...');

    console.log('[Fake Shop] Services shut down successfully');
});

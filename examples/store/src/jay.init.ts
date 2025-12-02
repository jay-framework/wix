/**
 * Service initialization for the fake-shop example.
 *
 * This file is loaded by the dev-server on startup and registers
 * all services that pages can use via dependency injection.
 */

import {
    onInit,
    onShutdown,
    registerService,
    getService,
} from '@jay-framework/stack-server-runtime';

onInit(async () => {
    console.log('[Fake Shop] Initializing services...');

    console.log('[Fake Shop] Services initialized successfully!!!!');
});

onShutdown(async () => {
    console.log('[Fake Shop] Shutting down services...');

    console.log('[Fake Shop] Services shut down successfully');
});

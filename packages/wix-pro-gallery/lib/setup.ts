import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

/** No configuration: galleries are addressed by the galleryId prop and read with the site's visitor client. */
export async function setupWixProGallery(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }
    return {
        status: 'configured',
        configCreated: [],
        message: 'Wix Pro Gallery ready (pass galleryId per gallery)',
    };
}

export const setup = setupWixProGallery;

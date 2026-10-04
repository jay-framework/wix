import { ApiKeyStrategy, createClient, WixClient, AppStrategy } from '@wix/sdk';
import { WixConfig } from './config-loader';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';

// The service registered under WIX_CLIENT_SERVICE is the WixClient itself
// (see provideWixClientService below). Consumers use it directly as a client.
export type WixClientService = WixClient;

export const WIX_CLIENT_SERVICE = createJayService<WixClientService>('WixClientService');

export function provideWixClientService(config: WixConfig) {
    const auth =
        config.auth.kind === 'apiKey'
            ? ApiKeyStrategy({
                  apiKey: config.auth.apiKey.apiKey,
                  siteId: config.auth.apiKey.siteId,
              })
            : AppStrategy({
                  appId: config.auth.app.appId,
                  appSecret: config.auth.app.appSecret,
              });

    const instance = createClient({ auth, modules: {} });
    registerService(WIX_CLIENT_SERVICE, instance);
}

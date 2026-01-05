import {ApiKeyStrategy, createClient, WixClient} from "@wix/sdk";
import {WixConfig} from "./config-loader";
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';

export interface WixClientService {
    wixClient: WixClient;
}

export const WIX_CLIENT_SERVICE =
    createJayService<WixClientService>('WixClientService');

export function provideWixClientService(config: WixConfig) {
    const instance = createClient({
        auth: ApiKeyStrategy({
            apiKey: config.apiKey.apiKey,
            siteId: config.apiKey.siteId
        }),
        modules: {
        },
    })
    registerService(WIX_CLIENT_SERVICE, instance);

}
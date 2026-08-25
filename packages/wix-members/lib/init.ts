import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixMembersService } from './services/wix-members-service';
import { provideWixMembersContext, type WixMembersInitData } from './contexts/wix-members-context';
import { loadWixMembersConfig } from './config-loader';

export type { WixMembersInitData } from './contexts/wix-members-context.js';
export type { WixMembersConfig } from './config-loader.js';

export const init = makeJayInit()
    .withServer(async (): Promise<WixMembersInitData> => {
        console.log('[wix-members] Initializing Wix Members service...');

        getService(WIX_CLIENT_SERVICE);
        provideWixMembersService();

        const config = loadWixMembersConfig();
        console.log(`[wix-members] Auth callback URL: ${config.authCallbackUrl}`);
        console.log('[wix-members] Server initialization complete');

        return {
            authCallbackUrl: config.authCallbackUrl,
        };
    })
    .withClient(async (data: WixMembersInitData) => {
        console.log('[wix-members] Initializing client-side members context...');

        const membersContext = provideWixMembersContext(data);
        await membersContext.refreshMemberState();

        console.log('[wix-members] Client initialization complete');
    });

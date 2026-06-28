import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixMembersService } from './services/wix-members-service';
import { provideWixMembersContext, type WixMembersInitData } from './contexts/wix-members-context';

export type { WixMembersInitData } from './contexts/wix-members-context.js';

export const init = makeJayInit()
    .withServer(async (): Promise<WixMembersInitData> => {
        console.log('[wix-members] Initializing Wix Members service...');

        getService(WIX_CLIENT_SERVICE);
        provideWixMembersService();

        console.log('[wix-members] Server initialization complete');

        return {};
    })
    .withClient(async (data: WixMembersInitData) => {
        console.log('[wix-members] Initializing client-side members context...');

        const membersContext = provideWixMembersContext(data);
        membersContext.refreshMemberState();

        console.log('[wix-members] Client initialization complete');
    });

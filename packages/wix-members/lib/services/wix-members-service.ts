import { registerService } from '@jay-framework/stack-server-runtime';
import { WIX_MEMBERS_SERVICE, WixMembersService } from './wix-members-service-marker.js';

export function provideWixMembersService(): WixMembersService {
    const service: WixMembersService = {};

    registerService(WIX_MEMBERS_SERVICE, service);
    return service;
}

export { WIX_MEMBERS_SERVICE, type WixMembersService } from './wix-members-service-marker.js';

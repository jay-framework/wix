import { createJayService } from '@jay-framework/fullstack-component';

export interface WixMembersService {
    // Server-side member operations are minimal for now.
    // The main auth flows (login/register/logout) use client.auth.* (OAuthStrategy)
    // which runs client-side. The server service exists for future use
    // (e.g., admin member lookup, protected page token validation).
}

export const WIX_MEMBERS_SERVICE = createJayService<WixMembersService>('Wix Members Service');

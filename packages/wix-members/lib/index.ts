export { WIX_MEMBERS_SERVICE, provideWixMembersService } from './services/wix-members-service';
export type { WixMembersService } from './services/wix-members-service';

export { WIX_MEMBERS_CONTEXT, provideWixMembersContext } from './contexts/wix-members-context';
export type {
    WixMembersContext,
    WixMembersInitData,
    ReactiveMemberIndicator,
    AuthCallbackResult,
} from './contexts/wix-members-context';

export { loginIndicator } from './components/login-indicator';
export { authCallback } from './components/auth-callback';
export { protectedPage } from './components/protected-page';

export { AUTH_COOKIE_NAME, setAuthCookie } from './utils/auth-cookie';

export { loadWixMembersConfig } from './config-loader';
export type { WixMembersConfig } from './config-loader';

export { validateAuthCallbackPage } from './validators/auth-callback-validator';

export { init } from './init';
export { setupWixMembers } from './setup';

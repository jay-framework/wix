export { WIX_MEMBERS_SERVICE, provideWixMembersService } from './services/wix-members-service';
export type { WixMembersService } from './services/wix-members-service';

export { WIX_MEMBERS_CONTEXT, provideWixMembersContext } from './contexts/wix-members-context';
export type {
    WixMembersContext,
    WixMembersInitData,
    ReactiveMemberIndicator,
    LoginResult,
    RegisterResult,
} from './contexts/wix-members-context';

export { mapLoginState, mapErrorMessage } from './contexts/member-helpers';

export { loginIndicator } from './components/login-indicator';
export { loginForm } from './components/login-form';
export { registerForm } from './components/register-form';
export { protectedPage } from './components/protected-page';

export { AUTH_COOKIE_NAME, setAuthCookie } from './utils/auth-cookie';

export { init } from './init';

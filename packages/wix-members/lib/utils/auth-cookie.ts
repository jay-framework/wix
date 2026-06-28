export const AUTH_COOKIE_NAME = 'wix_auth_role';

export function setAuthCookie(role: 'member' | 'visitor'): void {
    if (typeof document === 'undefined') return;

    if (role === 'member') {
        document.cookie = `${AUTH_COOKIE_NAME}=member; path=/; SameSite=Lax`;
    } else {
        document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0`;
    }
}

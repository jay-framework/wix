Wix Members plugin setup — auth callback page, login indicator, and protected pages.

## What wix-members provides

Three headless contracts:

- **login-indicator** — shows login/register/logout buttons. Place in site header or nav.
- **auth-callback** — handles the OAuth redirect after Wix-hosted login. Must live at a dedicated route.
- **protected-page** — guards a page, redirecting visitors to login.

## Setup steps

### 1. Config file

Running `jay-stack setup` creates `config/.wix-members.yaml` if it doesn't exist:

```yaml
authCallbackUrl: "/auth/callback"
```

This path must match a page in your site. Change it if you want a different route.

### 2. Auth callback page (required)

Create a page at the configured route. For the default `/auth/callback`:

```
src/pages/auth/callback/page.jay-html
```

Minimal template:

```html
<script type="application/jay-headless"
  plugin="wix-members"
  contract="auth-callback"
  key="callback">
</script>

<div if="callback.isProcessing">
  <p>Completing login...</p>
</div>

<div if="callback.hasError">
  <p>Login failed: {callback.errorMessage}</p>
  <a href="/">Return home</a>
</div>
```

This page handles the OAuth redirect from Wix, exchanges the authorization code for member tokens, and redirects the user back to their original page.

### 3. Login indicator (recommended)

Add to your site header or layout:

```html
<script type="application/jay-headless"
  plugin="wix-members"
  contract="login-indicator"
  key="auth">
</script>

<div if="!auth.isLoggedIn">
  <button ref="auth.loginButton">Log in</button>
</div>

<div if="auth.isLoggedIn">
  <span>{auth.memberName}</span>
  <button ref="auth.logoutButton">Log out</button>
</div>
```

### 4. Protected pages (optional)

Wrap any page content with the protected-page contract to require login:

```html
<script type="application/jay-headless"
  plugin="wix-members"
  contract="protected-page"
  key="guard">
</script>

<div if="guard.isAuthorized">
  <!-- page content visible only to logged-in members -->
</div>

<div if="!guard.isAuthorized">
  <p>Please log in to view this page.</p>
</div>
```

## How the OAuth flow works

1. User clicks login button → `redirectToLogin()` generates OAuth PKCE data, stores it in sessionStorage, and redirects to Wix-hosted login page
2. User logs in on Wix → Wix redirects back to `authCallbackUrl` with authorization code
3. Auth callback page calls `handleAuthCallback()` → exchanges code for member tokens, sets auth cookie, redirects to original page
4. Subsequent page loads detect the auth cookie and restore member state

## Config reference

`config/.wix-members.yaml`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `authCallbackUrl` | string | `/auth/callback` | Route for OAuth redirect. Relative paths resolved against site origin. Absolute URLs (starting with `http`) used as-is. |

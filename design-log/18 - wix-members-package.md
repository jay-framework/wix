# Design Log 18: Wix Members Package

## Status

Draft

## Background

Jay Framework Wix apps currently have no identity management. All API calls use API Key (server) or anonymous visitor tokens (client). Users can browse and add to cart, but cannot log in, register, or have persistent member sessions.

Wix provides two SDK layers for auth. After scanning the actual installed SDK types, the right API for headless is the **OAuthStrategy** built into `@wix/sdk` (`client.auth`), not the `@wix/identity` or `@wix/authentication` modules directly.

## SDK Analysis (Verified from installed types)

### Two API Layers

**1. `@wix/sdk` OAuthStrategy (`client.auth.*`)** -- the right one for headless:

- `client.auth.login({ email, password, captchaTokens? })` → `StateMachine`
- `client.auth.register({ email, password, profile?, captchaTokens? })` → `StateMachine`
- `client.auth.getMemberTokensForDirectLogin(sessionToken)` → `Tokens`
- `client.auth.sendPasswordResetEmail(email, redirectUri)` → `void`
- `client.auth.loggedIn()` → `boolean`
- `client.auth.logout(originalUrl)` → `{ logoutUrl }`
- `client.auth.processVerification(nextInputs, state?)` → `StateMachine`
- `client.auth.captchaInvisibleSiteKey` / `captchaVisibleSiteKey`
- `client.auth.getMemberTokensForExternalLogin(memberId, apiKey)` → `Tokens` (admin/server only)

**2. `@wix/identity` (`authentication.loginV2`/`registerV2`)** -- lower-level server REST APIs:

- `registerV2(loginId, options)` → `StateMachineResponse`
- `loginV2(loginId, options)` → `StateMachineResponse`
- `signOn(loginId, options)` → `SignOnResponse` (trusted, no password, server-only)
- `changePassword(newPassword)` → `void`
- `logout(options)` → `RawHttpResponse`

**3. `@wix/authentication`** -- Velo/Wix Hosted only, NOT suitable for headless OAuth:

- Simple `login()`/`register()`/`logout()` but manages sessions via cookies
- Does NOT return tokens

### StateMachine States (from OAuthStrategy)

```typescript
enum LoginState {
  SUCCESS                    // → data.sessionToken (exchange for member tokens)
  FAILURE                    // → errorCode: 'invalidEmail' | 'invalidPassword' | 'resetPassword' | 'emailAlreadyExists' | ...
  EMAIL_VERIFICATION_REQUIRED // → data.stateToken (need to verify email first)
  OWNER_APPROVAL_REQUIRED    // → registration needs admin approval
  USER_CAPTCHA_REQUIRED      // → data.stateToken (need visible CAPTCHA)
  SILENT_CAPTCHA_REQUIRED    // → data.stateToken (need invisible CAPTCHA)
}
```

### Registration Profile (`IdentityProfile`)

Available fields from `@wix/identity`: `firstName`, `lastName`, `nickname`, `picture`, `language`, `privacyStatus` (PUBLIC/PRIVATE), `customFields`, `secondaryEmails`, `phonesV2`, `addresses`, `company`, `position`, `birthdate`, `slug`.

### Password Recovery (via `@wix/identity` recovery sub-module)

- `sendRecoveryEmail(email, options)` → sends reset email
- `recover(recoveryToken, options)` → completes reset
- OAuthStrategy also has: `client.auth.sendPasswordResetEmail(email, redirectUri)`

### Token Storage

Current `wix-server-client` stores tokens at `wix_visitor_tokens${oauthClientId}` in localStorage. After login, member tokens replace visitor tokens at the same key -- the `Tokens` type has `refreshToken.role` which is `'visitor'` or `'member'`, so we can detect auth state from stored tokens.

### CAPTCHA

Login/register may require CAPTCHA depending on Wix site settings. OAuthStrategy exposes `captchaInvisibleSiteKey` and `captchaVisibleSiteKey`. The state machine returns `SILENT_CAPTCHA_REQUIRED` or `USER_CAPTCHA_REQUIRED` states when needed.

### Exploration Results (Verified 2026-05-24)

All flows tested in `exploration/wix-members-auth/` against a live Wix site.

**Registration flow:**

- `client.auth.register({ email, password })` → `EMAIL_VERIFICATION_REQUIRED` (with `stateToken`)
- User receives code via email
- `client.auth.processVerification({ verificationCode })` → `SUCCESS` (with `sessionToken`)
- `client.auth.getMemberTokensForDirectLogin(sessionToken)` → member `Tokens`
- Site must be **published** — unpublished site returns `SITE_NOT_PUBLISHED_EXCEPTION`

**Login flow:**

- `client.auth.login({ email, password })` → `SUCCESS` (with `sessionToken`)
- `client.auth.getMemberTokensForDirectLogin(sessionToken)` → member `Tokens`
- Error codes: `invalidPassword`, `resetPassword` (forced reset), `invalidEmail`

**Token exchange (`getMemberTokensForDirectLogin`):**

- Uses a hidden iframe to hit `{site-url}/_api/oauth2/authorize` with `responseMode=web_message`
- Internally calls `redirects.createRedirectSession()` to get the authorize URL
- **Requires the calling domain in the Wix headless app's "Allowed redirect domains"** — otherwise returns `Allowed_domains_fetch_failed`
- For local dev, `localhost` must be added to allowed domains in Wix dashboard

**Auth state detection:**

- `client.auth.loggedIn()` checks `refreshToken.role === 'member'`
- Works on page reload when tokens are loaded from localStorage

**Logout:**

- `client.auth.logout(currentUrl)` → `{ logoutUrl }`
- Then generate fresh visitor tokens with `generateVisitorTokens()`

**Password reset:**

- `client.auth.sendPasswordResetEmail(email, redirectUri)` — sends Wix-managed reset email

## Problem

We need a `@jay-framework/wix-members` package that:

1. **Login** - lets visitors authenticate as site members
2. **Registration** - lets visitors create new member accounts
3. **Login indicator** - shows auth state in headers (logged in/out, member name/avatar)
4. Integrates with the existing `wix-server-client` OAuth token flow
5. Follows the same patterns as `wix-cart` (service + context + contracts + components)

## Questions & Answers

Q1: Should login/register be separate contracts or a single combined auth form?
A: Separate. (confirmed by user)

Q2: How should we handle the login redirect flow? Wix OAuth uses `generateVisitorTokens` for anonymous visitors -- do we upgrade the stored tokens after login, or replace them entirely?
A: Replace entirely. `client.auth.getMemberTokensForDirectLogin(sessionToken)` returns new `Tokens` with `refreshToken.role = 'member'`. Call `client.auth.setTokens(memberTokens)` and overwrite the same localStorage key. On logout, generate fresh visitor tokens.

Q3: Should member profile data (name, avatar, email) be fetched server-side in a slow/fast phase, or purely client-side?
A: **Client-side for the login indicator** — this keeps pages cacheable. The indicator resolves auth state purely in the interactive phase from stored tokens. No server round-trip needed for the indicator itself. See Q10 for the full caching analysis.

Q4: Do we need a "forgot password" / password reset flow in v1?
A: Yes, include it. `sendPasswordResetEmail(email, redirectUri)` is one call. The `redirectUri` comes from plugin config (e.g. `.wix.yaml` or init data). Add a `forgotPasswordButton` ref to the login-form contract.

Q5: Should the login indicator also handle "My Account" navigation (order history, profile settings), or just show status and logout?
A: No. The indicator provides an `isLoggedIn` variant -- the jay-html template can use that to conditionally show account links. No extra logic needed in the component.

Q6: How does login interact with the cart? If a visitor has items in cart and then logs in as a member, does the cart merge? Is this handled by Wix automatically?
A: Needs exploration. TODO: test in `exploration/wix-members-auth` by adding items to cart as visitor, then logging in and checking if cart persists/merges.

Q7: What registration modes does the Wix site support? (open registration, approval required, invite only) -- do we need to handle all of them?
A: The StateMachine already handles this: `OWNER_APPROVAL_REQUIRED` state after register means admin must approve. `EMAIL_VERIFICATION_REQUIRED` means email must be verified first. We should support all states the SDK returns -- they come for free.

Q8: Should login/register UI be a modal/drawer or a full page? Or should the contract be agnostic and let the jay-html template decide?
A: Let the HTML decide. Templates can implement a drawer using the popover API without any component code. If interactive drawer logic is needed, that's a requirement for the framework's ui-kit package, not this package.

Q9: How should we handle CAPTCHA? The SDK may return `SILENT_CAPTCHA_REQUIRED` or `USER_CAPTCHA_REQUIRED` states. This requires loading Google reCAPTCHA and getting a token.
A: The SDK has **hardcoded** Google reCAPTCHA site keys (`captchaInvisibleSiteKey` = `6LdoPaUfAAAAAJphvHoUoOob7mx0KDlXyXlgrx5v`, `captchaVisibleSiteKey` = `6Ld0J8IcAAAAANyrnxzrRlX1xrrdXsOmsepUYosy`). CAPTCHA is configured per-site in Wix dashboard (Settings > Signup & Login Security). When enabled, CAPTCHA is triggered either always or for suspected bots. The flow:

1. Call `login()`/`register()` without CAPTCHA token
2. If CAPTCHA required, SDK returns `FAILURE` with `errorCode: 'missingCaptchaToken'`
3. Load Google reCAPTCHA with the appropriate site key
4. Get reCAPTCHA token and retry with `captchaTokens: { invisibleRecaptchaToken }` or `{ recaptchaToken }`
5. Pass tokens via `client.auth.login({ email, password, captchaTokens: { invisibleRecaptchaToken: token } })`

Note: the `SILENT_CAPTCHA_REQUIRED` / `USER_CAPTCHA_REQUIRED` states from the `StateMachine` type are NOT actually emitted by the current `handleState()` implementation in the SDK -- it only maps SUCCESS, OWNER_APPROVAL_REQUIRED, and EMAIL_VERIFICATION_REQUIRED. CAPTCHA failures come as `FAILURE` with `errorCode: 'missingCaptchaToken'` or `'invalidCaptchaToken'`. This means CAPTCHA handling is simpler than expected: detect the error code, get a token, retry.

Q10: How does the login indicator interact with page caching?
A: Two modes depending on what the page needs:

**Mode 1: Cacheable pages (most pages)** — login indicator resolved client-side only.

- Server renders the indicator in its loading/logged-out state (fast phase returns `isLoggedIn: false, isLoading: true`)
- The page can be cached (CDN, SSG, etc.)
- Client interactive phase checks stored tokens (from cookies), updates reactive signals
- Brief flash of logged-out state until client resolves — acceptable for headers

**Mode 2: Login-protected pages** — auth resolved server-side, page not cached.

- Server reads member tokens from cookie on the request
- If not authenticated: component's fast phase returns redirect (302) or 403
- If authenticated: render page with member data in fast phase, serve with `Cache-Control: no-store`
- The component itself returns the redirect/403 from its fast render — this is the keyed headless component pattern

Q11: How should login-protected pages work?
A: Uses the existing keyed headless component fast-render mechanism:

1. Member tokens are stored in **cookies** (set by client after login, readable by server)
2. A "login-protected" component's fast phase reads tokens from the cookie
3. If no valid member tokens → fast phase returns redirect to login page (302) or 403
4. If valid member tokens → fast phase renders page content, sets `Cache-Control: no-store` (similar to how SEO headers are set in fast rendering)
5. No new framework route-guard mechanism needed — the component's fast phase already supports redirect/error responses

Q12: How should tokens be stored?
A: **Cookies** instead of localStorage. This makes tokens available to both client (interactive phase) and server (fast phase for protected pages). The client sets the cookie after login/logout. The server reads it during fast rendering.

## Design

### Token Storage: Cookies

Tokens are stored in **cookies** (not localStorage). This makes them available to both client and server:

- **Client sets cookie** after login (`getMemberTokensForDirectLogin`) or logout (`generateVisitorTokens`)
- **Server reads cookie** during fast phase for protected pages
- Cookie name: `wix_member_tokens` (or per-oauthClientId)
- Cookie flags: `SameSite=Lax`, `Secure` (in production), `Path=/`
- Token content: same `Tokens` structure (access + refresh with role)

Note: `wix-server-client` currently uses localStorage — this package will need to migrate or dual-write. This may be a change to `wix-server-client` itself.

### Page Caching & Auth Modes

Two rendering strategies depending on the page's auth requirements:

```
┌──────────────────────────────────────────────────────┐
│ Cacheable Pages (login indicator in header)          │
│                                                      │
│ Server (fast phase):                                 │
│   → Render indicator as loading/logged-out            │
│   → Page is cacheable                                │
│                                                      │
│ Client (interactive phase):                          │
│   → Read tokens from cookie                          │
│   → If role=member: update signals (name, avatar)    │
│   → If role=visitor: stay in logged-out state         │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Login-Protected Pages (keyed headless component)     │
│                                                      │
│ Server (fast phase):                                 │
│   → Read member tokens from cookie                   │
│   → No auth → return redirect (302) to login page    │
│   → Has auth → render page + set no-cache header     │
│                                                      │
│ Client (interactive phase):                          │
│   → Normal component behavior, member is known       │
└──────────────────────────────────────────────────────┘
```

The login indicator follows the same pattern as `cart-indicator` — interactive-phase only, no meaningful fast-phase data.

Login-protected pages use the component's fast-phase redirect/403 capability (keyed headless component pattern). No new framework route-guard needed.

### Framework Requirements

Features this package needs from the framework that may not exist yet:

1. **Per-component cache headers** — a component's fast phase should be able to set `Cache-Control: no-store` on the page response (similar to how SEO metadata is set)
2. **Cookie access in fast phase** — the server-side fast render needs to read cookies from the incoming request
3. **Fast-phase redirect/403** — the fast phase can return a redirect or error status instead of view state (may already exist for keyed components — needs verification)

### Package Structure

```
packages/wix-members/
├── lib/
│   ├── index.ts                          # Server exports
│   ├── index.client.ts                   # Client exports
│   ├── init.ts                           # makeJayInit (server + client)
│   ├── services/
│   │   ├── wix-members-service.ts        # Server-side member operations
│   │   └── wix-members-service-marker.ts # Service marker
│   ├── contexts/
│   │   └── wix-members-context.ts        # Client-side auth state + operations
│   ├── components/
│   │   ├── login-indicator.ts            # Header login/logout indicator
│   │   ├── login-form.ts                 # Login form component
│   │   └── register-form.ts             # Registration form component
│   ├── contracts/
│   │   ├── login-indicator.jay-contract  # Auth status display
│   │   ├── login-form.jay-contract       # Login form
│   │   └── register-form.jay-contract    # Registration form
│   └── utils/
│       └── member-helpers.ts             # Token upgrade, member data mapping
├── plugin.yaml
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Contracts

#### login-indicator.jay-contract

Modeled after `cart-indicator` -- lightweight, header-friendly.

```yaml
name: login-indicator
description: Shows member login state in site header/navigation

tags:
  - tag: isLoggedIn
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether a member is currently logged in

  - tag: memberName
    type: data
    dataType: string
    phase: fast+interactive
    description: Logged-in member's display name (first name or email)

  - tag: memberAvatar
    type: data
    dataType: string
    phase: fast+interactive
    description: URL of member's profile image

  - tag: isLoading
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether auth state is being resolved

  # Only logoutButton needs component logic (calls membersContext.logout())
  # Login/register/profile links are plain HTML — no ref needed,
  # the template uses regular <a href="/login"> inside if="!isLoggedIn"
  - tag: logoutButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to trigger logout (calls context.logout())
```

Template usage example:

```html
<div jay-headless plugin="@jay-framework/wix-members" contract="login-indicator">
  <div if="isLoading">...</div>
  <div if="isLoggedIn">
    <img src="{memberAvatar}" alt="{memberName}" />
    <span>{memberName}</span>
    <button ref="logoutButton">Log Out</button>
    <a href="/account">My Account</a>
  </div>
  <div if="!isLoggedIn">
    <a href="/login">Log In</a>
    <a href="/register">Sign Up</a>
  </div>
</div>
```

#### login-form.jay-contract

```yaml
name: login-form
description: Member login form with email/password

tags:
  - tag: emailInput
    type: interactive
    elementType: HTMLInputElement
    description: Email input field

  - tag: passwordInput
    type: interactive
    elementType: HTMLInputElement
    description: Password input field

  - tag: submitButton
    type: interactive
    elementType: HTMLButtonElement
    description: Submit login form

  - tag: isSubmitting
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether login request is in progress

  - tag: errorMessage
    type: data
    dataType: string
    phase: fast+interactive
    description: Login error message (empty if no error)

  - tag: hasError
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether there is a login error

  - tag: forgotPasswordButton
    type: interactive
    elementType: HTMLButtonElement
    description: Sends password reset email using the email input value

  - tag: resetSent
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether a password reset email was sent successfully
```

#### register-form.jay-contract

```yaml
name: register-form
description: Member registration form

tags:
  - tag: emailInput
    type: interactive
    elementType: HTMLInputElement
    description: Email input field

  - tag: passwordInput
    type: interactive
    elementType: HTMLInputElement
    description: Password input field

  - tag: firstNameInput
    type: interactive
    elementType: HTMLInputElement
    description: First name input (optional)

  - tag: lastNameInput
    type: interactive
    elementType: HTMLInputElement
    description: Last name input (optional)

  - tag: submitButton
    type: interactive
    elementType: HTMLButtonElement
    description: Submit registration form

  - tag: isSubmitting
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether registration request is in progress

  - tag: errorMessage
    type: data
    dataType: string
    phase: fast+interactive
    description: Registration error message

  - tag: hasError
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether there is a registration error

  - tag: isPending
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether registration requires admin approval (PENDING status)

  - tag: isSuccess
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether registration completed successfully
```

### Context (Client-Side)

Uses `WIX_CLIENT_CONTEXT` to access `client.auth.*` methods from OAuthStrategy.

```typescript
import { LoginState, StateMachine, Tokens, TokenRole } from '@wix/sdk';

export interface LoginResult {
  state: LoginState;
  errorCode?: string; // on FAILURE
  errorMessage?: string; // human-readable
  requiresCaptcha?: 'silent' | 'visible'; // on CAPTCHA states
}

export interface RegisterResult {
  state: LoginState;
  errorCode?: string;
  errorMessage?: string;
  requiresCaptcha?: 'silent' | 'visible';
}

export interface ReactiveMemberIndicator {
  isLoggedIn: Getter<boolean>;
  memberName: Getter<string>;
  memberAvatar: Getter<string>;
}

export interface WixMembersContext {
  // Reactive indicator
  memberIndicator: ReactiveMemberIndicator;

  // Auth operations (use client.auth.* internally)
  login(email: string, password: string, captchaToken?: string): Promise<LoginResult>;
  register(
    email: string,
    password: string,
    profile?: { firstName?: string; lastName?: string },
    captchaToken?: string,
  ): Promise<RegisterResult>;
  logout(): Promise<void>;
  sendPasswordResetEmail(email: string, redirectUri: string): Promise<void>;
  refreshMemberState(): Promise<void>;

  // Events
  onLogin: EventEmitter<void>;
  onLogout: EventEmitter<void>;
}

export const WIX_MEMBERS_CONTEXT = createJayContext<WixMembersContext>('wix:members');
```

Key implementation detail: on successful login/register, the context must:

1. Call `client.auth.getMemberTokensForDirectLogin(sessionToken)`
2. Call `client.auth.setTokens(memberTokens)`
3. Store updated tokens in localStorage (reuse wix-server-client's storage key)
4. Update reactive signals (isLoggedIn, memberName, etc.)
5. Emit `onLogin` event

On logout:

1. Call `client.auth.logout(window.location.href)`
2. Generate fresh visitor tokens and set them
3. Clear member signals
4. Emit `onLogout` event

### Init Pattern

```typescript
export const init = makeJayInit()
  .withServer(async (): Promise<WixMembersInitData> => {
    const wixClient = getService(WIX_CLIENT_SERVICE);
    provideWixMembersService(wixClient);
    return {};
  })
  .withClient(async (data: WixMembersInitData) => {
    const membersContext = provideWixMembersContext();
    // Check if visitor already has member tokens
    membersContext.refreshMemberState();
  });
```

### Token Flow (Verified against OAuthStrategy API)

Uses `client.auth.*` methods from `@wix/sdk` OAuthStrategy:

```
Login:
1. Visitor arrives → wix-server-client generates visitor tokens (role: 'visitor'), stored in cookie
2. Visitor submits login → call client.auth.login({ email, password })
3. StateMachine returned:
   - SUCCESS → data.sessionToken
   - FAILURE → errorCode ('invalidEmail', 'invalidPassword', 'resetPassword', 'missingCaptchaToken', ...)
   - EMAIL_VERIFICATION_REQUIRED → show verification UI
4. On SUCCESS: call client.auth.getMemberTokensForDirectLogin(sessionToken) → Tokens
5. client.auth.setTokens(memberTokens) + write cookie (member tokens)
6. Emit onLogin event → cart and other contexts refresh with member identity

Register:
1. Call client.auth.register({ email, password, profile? })
2. StateMachine returned:
   - SUCCESS → sessionToken → exchange for member tokens (same as login step 4-6)
   - OWNER_APPROVAL_REQUIRED → show "pending approval" message
   - EMAIL_VERIFICATION_REQUIRED → show email verification UI
   - FAILURE → errorCode ('emailAlreadyExists', 'missingCaptchaToken', ...)

Logout:
1. Call client.auth.logout(currentUrl) → { logoutUrl }
2. Generate fresh visitor tokens: client.auth.generateVisitorTokens()
3. client.auth.setTokens(visitorTokens) + write cookie (visitor tokens)
4. Emit onLogout event → cart and other contexts refresh

Detect auth state (client, on page load):
1. Read tokens from cookie
2. Check refreshToken.role === 'member' → already logged in
3. If member: update reactive signals (name, avatar)
4. If visitor: stay in logged-out state

Detect auth state (server, for protected pages):
1. Read tokens from cookie on incoming request
2. Check refreshToken.role === 'member' → render page with member data + no-cache
3. If visitor → fast phase returns redirect to login page
```

### Integration with Cart

After login, emit `onLogin` so `wix-cart` can refresh the cart (Wix may merge visitor cart with member cart automatically). The `wix-members` context should not depend on `wix-cart` -- cart listens to member events, not the other way around.

### plugin.yaml

```yaml
name: wix-members

contracts:
  - name: login-indicator
    contract: login-indicator.jay-contract
    component: loginIndicator
    description: Shows member auth state in site header

  - name: login-form
    contract: login-form.jay-contract
    component: loginForm
    description: Email/password login form

  - name: register-form
    contract: register-form.jay-contract
    component: registerForm
    description: Member registration form

services:
  - name: wix-members
    marker: WIX_MEMBERS_SERVICE
    description: Server-side member operations via Wix Members API

contexts:
  - name: wix-members
    marker: WIX_MEMBERS_CONTEXT
    description: Client-side member auth state, login/register/logout operations
```

### Jay-HTML Usage Example

```html
<!-- Login indicator in header -->
<div jay-headless plugin="@jay-framework/wix-members" contract="login-indicator">
  <div if="isLoading">...</div>
  <div if="isLoggedIn">
    <img src="{memberAvatar}" alt="{memberName}" />
    <span>{memberName}</span>
    <button ref="logoutButton">Log Out</button>
    <a href="/account">My Account</a>
  </div>
  <div if="!isLoggedIn">
    <a href="/login">Log In</a>
    <a href="/register">Sign Up</a>
  </div>
</div>

<!-- Login form (on /login page) -->
<form jay-headless plugin="@jay-framework/wix-members" contract="login-form">
  <div if="hasError" class="error">{errorMessage}</div>
  <div if="resetSent" class="success">Password reset email sent.</div>
  <input ref="emailInput" type="email" placeholder="Email" />
  <input ref="passwordInput" type="password" placeholder="Password" />
  <button ref="submitButton" disabled-if="isSubmitting">
    <span if="!isSubmitting">Log In</span>
    <span if="isSubmitting">Logging in...</span>
  </button>
  <button ref="forgotPasswordButton" type="button">Forgot password?</button>
</form>
```

## Implementation Plan

### Phase 1: Package Scaffolding

- Create `packages/wix-members/` with standard structure
- Add `package.json` -- no new Wix SDK deps needed, uses `client.auth.*` from `@wix/sdk` via `wix-server-client`
- Add `plugin.yaml`, `tsconfig.json`, `vite.config.ts`
- Add to workspace

### Phase 2: Contracts

- Write the three `.jay-contract` files
- Generate TypeScript definitions

### Phase 3: Service + Context

- Implement `WixMembersService` (server-side, API Key auth)
- Implement `WixMembersContext` (client-side, OAuth)
- Token upgrade flow (visitor → member)
- Reactive signals for login indicator

### Phase 4: Components

- `loginIndicator` component (fast + interactive phases)
- `loginForm` component (interactive only)
- `registerForm` component (interactive only)

### Phase 5: Init + Integration

- `init.ts` with `makeJayInit` pattern
- Event emission for cross-plugin integration (cart merge on login)

### Phase 6: Agent-Kit Guide

- Add guide to `agent-kit/plugin/` explaining:
  - How to add a login indicator to any page header (contract tags, template pattern, plain links for login/register)
  - How to create login and register pages using the form contracts
  - How to set up a login-protected page
  - Password reset flow and configuration
  - Cookie-based token storage and caching implications
- This guide is what the designer agent uses to help template authors wire up auth

### Phase 7: Example Integration

- Add to whisky-exchange or store example
- Login indicator in header
- Login/register page

## Trade-offs

| Decision                                | Benefit                                               | Cost                                    |
| --------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| Separate login/register contracts       | Template flexibility, can place them independently    | More contracts to maintain              |
| Client-side only auth forms             | No server round-trip for form state, instant feedback | Forms don't work without JS             |
| Events for cross-plugin integration     | Loose coupling, wix-members doesn't know about cart   | Cart merge timing may be tricky         |
| No password reset in v1                 | Simpler scope                                         | Users may expect it                     |
| Contract-agnostic UI (no modal opinion) | Template designer chooses modal vs page               | Slightly more work for template authors |

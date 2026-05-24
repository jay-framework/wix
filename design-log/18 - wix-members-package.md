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
- **Requires the calling domain in the Wix headless app's "Allowed Domains"** — otherwise returns `Allowed_domains_fetch_failed`
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
A:

Q4: Do we need a "forgot password" / password reset flow in v1?
A: Available cheaply -- OAuthStrategy has `sendPasswordResetEmail(email, redirectUri)` which sends Wix-managed reset email. We could add a `forgotPasswordButton` ref to login-form and handle it in the interactive phase. Low effort. But requires the redirect URI to point at a valid page -- worth including?

Q5: Should the login indicator also handle "My Account" navigation (order history, profile settings), or just show status and logout?
A:

Q6: How does login interact with the cart? If a visitor has items in cart and then logs in as a member, does the cart merge? Is this handled by Wix automatically?
A:

Q7: What registration modes does the Wix site support? (open registration, approval required, invite only) -- do we need to handle all of them?
A: The StateMachine already handles this: `OWNER_APPROVAL_REQUIRED` state after register means admin must approve. `EMAIL_VERIFICATION_REQUIRED` means email must be verified first. We should support all states the SDK returns -- they come for free.

Q8: Should login/register UI be a modal/drawer or a full page? Or should the contract be agnostic and let the jay-html template decide?
A:

Q9: How should we handle CAPTCHA? The SDK may return `SILENT_CAPTCHA_REQUIRED` or `USER_CAPTCHA_REQUIRED` states. This requires loading Google reCAPTCHA and getting a token.
A:

## Design

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

  # Interactive elements
  - tag: loginButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to trigger login (shows when logged out)

  - tag: logoutButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to trigger logout (shows when logged in)

  - tag: registerButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to navigate to registration

  - tag: profileLink
    type: interactive
    elementType: HTMLAnchorElement
    description: Link to member profile/account page
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
  errorCode?: string;         // on FAILURE
  errorMessage?: string;      // human-readable
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
  register(email: string, password: string, profile?: { firstName?: string; lastName?: string }, captchaToken?: string): Promise<RegisterResult>;
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
1. Visitor arrives → wix-server-client generates visitor tokens (role: 'visitor')
2. Visitor submits login → call client.auth.login({ email, password })
3. StateMachine returned:
   - SUCCESS → data.sessionToken
   - FAILURE → errorCode ('invalidEmail', 'invalidPassword', 'resetPassword', ...)
   - SILENT_CAPTCHA_REQUIRED → retry with invisible reCAPTCHA token
   - USER_CAPTCHA_REQUIRED → show visible reCAPTCHA, retry with token
   - EMAIL_VERIFICATION_REQUIRED → show verification UI
4. On SUCCESS: call client.auth.getMemberTokensForDirectLogin(sessionToken) → Tokens
5. client.auth.setTokens(memberTokens) + store in localStorage (same key)
6. Emit onLogin event → cart and other contexts refresh with member identity

Register:
1. Call client.auth.register({ email, password, profile? })
2. StateMachine returned:
   - SUCCESS → sessionToken → exchange for member tokens (same as login step 4-6)
   - OWNER_APPROVAL_REQUIRED → show "pending approval" message
   - EMAIL_VERIFICATION_REQUIRED → show email verification UI
   - FAILURE → errorCode ('emailAlreadyExists', ...)

Logout:
1. Call client.auth.logout(currentUrl) → { logoutUrl }
2. Generate fresh visitor tokens: client.auth.generateVisitorTokens()
3. client.auth.setTokens(visitorTokens) + store in localStorage
4. Emit onLogout event → cart and other contexts refresh

Detect auth state on page load:
1. Read stored tokens from localStorage
2. Check refreshToken.role === 'member' → already logged in
3. If member: client.auth.loggedIn() confirms, read profile from token/identity
4. If visitor: show logged-out state
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
  </div>
  <div if="!isLoggedIn">
    <button ref="loginButton">Log In</button>
    <button ref="registerButton">Sign Up</button>
  </div>
</div>

<!-- Login form -->
<form jay-headless plugin="@jay-framework/wix-members" contract="login-form">
  <div if="hasError" class="error">{errorMessage}</div>
  <input ref="emailInput" type="email" placeholder="Email" />
  <input ref="passwordInput" type="password" placeholder="Password" />
  <button ref="submitButton" disabled-if="isSubmitting">
    <span if="!isSubmitting">Log In</span>
    <span if="isSubmitting">Logging in...</span>
  </button>
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

### Phase 6: Example Integration
- Add to whisky-exchange or store example
- Login indicator in header
- Login/register page

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Separate login/register contracts | Template flexibility, can place them independently | More contracts to maintain |
| Client-side only auth forms | No server round-trip for form state, instant feedback | Forms don't work without JS |
| Events for cross-plugin integration | Loose coupling, wix-members doesn't know about cart | Cart merge timing may be tricky |
| No password reset in v1 | Simpler scope | Users may expect it |
| Contract-agnostic UI (no modal opinion) | Template designer chooses modal vs page | Slightly more work for template authors |

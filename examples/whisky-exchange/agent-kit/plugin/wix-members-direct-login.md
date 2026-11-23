# wix-members — direct login, sign-up and password reset

Direct member login, sign-up and password reset on your own page: form templates, autocomplete roles, validator rules.

Use this guide when a page logs members in, or signs them up, **on the page itself** with the
`WIX_MEMBERS_CONTEXT` API (`login`, `register`, `verifyEmail`, `sendPasswordReset`). `jay-stack validate`
checks these pages. Every finding starts with `[wix-members/<rule>]`, and each rule has a section below.

## Direct login or Wix-hosted login?

- **Wix-hosted** (`login-indicator` → redirect, see `wix-members-setup.md`): Wix owns the forms, the reset
  flow and the security. Prefer it unless the design needs the form on your page.
- **Direct**: your page renders the form and calls `members.login(email, password)` or
  `members.register(email, password)`. You then own what password managers and members expect: the
  rules below.

## How the validator finds a login page

It reads each `page.ts` and looks for `.withContexts(WIX_MEMBERS_CONTEXT)` → `.withInteractive(fn)`
calling `login(` / `register(` on that context parameter. It follows destructuring (`const { login } = members`),
aliases (`const m = members`), and helpers in a file the page imports directly (`./sign-up.ts`). **Call
`login`/`register`/`sendPasswordReset` in the page file or in such a direct helper.** Deeper calls are not seen,
so the page is not checked.

## Templates

The page must import a wix-members headless contract, or `WIX_MEMBERS_CONTEXT` is not provided and the
page fails to hydrate. The header's login indicator is the usual one:

```html
<script type="application/jay-headless" plugin="@jay-framework/wix-members" contract="login-indicator" key="member"></script>
```

Login (`src/pages/login/page.jay-html`):

```html
<form ref="form">
  <input ref="email" type="email" autocomplete="username" />
  <input ref="password" type="password" autocomplete="current-password" />
  <button type="submit">Log in</button>
  <a href="/forgot-password">Forgot password?</a>
</form>
```

Sign-up:

```html
<form ref="form">
  <input ref="email" type="email" autocomplete="username" />
  <input ref="password" type="password" autocomplete="new-password" />
  <input ref="confirmPassword" type="password" autocomplete="new-password" />
  <button type="submit">Sign up</button>
</form>
```

Verify email (after `emailVerificationRequired`): `<input ref="code" autocomplete="one-time-code" inputmode="numeric">`.

Reset (`src/pages/forgot-password/page.jay-html`): a form with the email input and a submit button.

Wire the form's **submit** event, not a button click, so Enter submits and password managers see a submit:

```ts
function SignupInteractive(props, refs, members) {
    refs.form.onsubmit(({ event }) => {
        event.preventDefault();
        members.register(email(), password());
    });
    // ...
}
```

## Rules

### password-not-in-form (error)

A password field with no `<form>` around it. Password managers detect save and update reliably only on
a real form, and Enter submits only there. Fix: wrap the fields in `<form>` and use `<button type="submit">`.

### password-type (error)

A field named like a password (`ref`/`name`/`id` with the segment `password`, `passwd` or `pwd`, e.g.
`newPassword`, `confirm-password`) without `type="password"`. A show/hide toggle may bind the type:
`type="{passwordInputType}"`.

### autocomplete-role (error)

The `autocomplete` token must match what the page does:

| Page calls | Every password field |
|---|---|
| `login()` | `autocomplete="current-password"` |
| `register()` | `autocomplete="new-password"` (password and confirm) |
| both | one form all `current-password`, another all `new-password` |

With the wrong token, the manager fills an old password on sign-up instead of generating a new one.
A change-password page that calls `login()` to re-authenticate can suppress this rule for that page.

### identifier-autocomplete (warning)

The email or username input next to the password has an `autocomplete` token that is neither `username`
nor `email` (e.g. `off`, `name`). Use `autocomplete="username"`. (A **missing** token is reported by jay's
generic form checks, not here.)

### no-password-reset (warning)

The project calls `login()`, but no page calls `sendPasswordReset(email)`. Add a "Forgot password?" page.
If you rely on Wix-hosted reset, suppress it in `.jay`.

### secret-in-storage (error)

`localStorage` / `sessionStorage` (`window.` or `globalThis.` too) `.setItem('password' | 'secret' | …)`.
Never store a password or secret in the browser; any script on the site can read it. The password manager
remembers passwords.

### token-in-storage (warning)

`.setItem` with a key such as `accessToken` or `apiAccessKey`. The Wix client already persists the member
session. Read it from the wix-members context (`memberAccessToken()`) instead of keeping your own copy.

### typescript-missing (warning)

These checks parse page TS with `typescript`. Install it as a dev dependency: `npm install -D typescript`.

## Passkeys: not available yet

Wix supports passkeys only for site owners' Wix accounts. Headless **member** login has no WebAuthn API,
so **do not hand-roll WebAuthn** (`navigator.credentials.create/get`) against Wix members. There is no
server to verify it. Keep `autocomplete="username"` on the identifier, so conditional UI
(`autocomplete="username webauthn"`) can be added once Wix exposes member passkeys.

## Suppressing

Per page, in `<head>`:

```html
<script type="application/jay-validations">
  wix-members:
    autocomplete-role: true
</script>
```

Per project, in `.jay` (the only place for `no-password-reset`, `secret-in-storage`, `token-in-storage`):

```yaml
validations:
  wix-members:
    no-password-reset: true
```

A page rule listed in `.jay` is silenced on every page.

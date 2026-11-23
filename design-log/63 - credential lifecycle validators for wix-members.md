# 63 - Credential lifecycle validators for wix-members

**Status:** [Implemented] — approved (product, 2026-11-23); implemented 2026-11-23

## Decisions for the Implementer (TL;DR)

1. Add **two wix-members validators that share one pure function**, `findAuthPages(projectRoot)` (TS AST scan, memoized per validate run — see Detection):
   - a **project validator** (`credentials-project`, `projectValidators:`) — reset rule + storage rules (TS only, no DOM needed);
   - a **jay-html validator** (`credentials-page`, `validators:`) — DOM rules, run only on pages `findAuthPages` returns. It uses the parsed `body` and `validationOverrides` jay already hands a `JayHtmlValidatorFn`.
2. **Seven rules ship:** `password-not-in-form`, `password-type`, `autocomplete-role` (`current-password` for login, `new-password` for register), `identifier-autocomplete`, `no-password-reset`, `secret-in-storage`, `token-in-storage`.
3. **Not shipped:** a `webauthn` rule (Wix members have no passkey API today) and the generic "has an autocomplete token" check (owned by the generic jay forms autocomplete validation).
4. **One id scheme:** lowercase kebab-case ids (e.g. `password-not-in-form`), used as the suppression key and as the message prefix `[wix-members/password-not-in-form]` (findings have no id field; tests compare the prefix). Every message names the new guide `agent-kit/plugin/wix-members-direct-login.md`.
5. **Suppression:** page rules (`password-not-in-form`, `password-type`, `autocomplete-role`, `identifier-autocomplete`) — per page (`application/jay-validations`, key `wix-members`) or per project (`.jay` `validations.wix-members`). Project rules (`no-password-reset`, `secret-in-storage`, `token-in-storage`) get only `{projectRoot}` — **per project via `.jay` only**.
6. **`typescript` is an optional peerDependency** (`>=5`), loaded with a lazy `await import('typescript')` inside `findAuthPages`. It is only a devDependency today (`packages/wix-members/package.json:71`), so a static import would fail in consumer projects running the published `dist/`. When missing, the project validator emits one `warning` `[wix-members/typescript-missing]` with `file: 'package.json'` (a diagnostic, not one of the seven rules, not suppressible) "credential validators skipped: install `typescript` as a dev dependency"; the page validator emits nothing (no duplicate). Not moved to `dependencies`: it would add a large runtime install to every site for a dev-only check, and Jay projects normally have `typescript` already.
7. Tests are written RED first, one fixture project per rule, with the correct findings as the expected output.

## Background

Point #10 of the Chrome article *"Top 10 things AI gets wrong in web dev"* is the credential lifecycle: password managers need `autocomplete` tokens, login must be a real `<form>`, sign-up needs `new-password`, a password reset must exist, secrets must not live in `localStorage`, and passkeys use conditional UI (`autocomplete="username webauthn"`).

What wix-members offers today (verified):

| Fact | Where |
|------|-------|
| Direct email/password auth is only a **TS context API**: `login`, `register`, `verifyEmail`, `sendPasswordReset` | `packages/wix-members/lib/contexts/wix-members-context.ts:96-102`, wired at `:239-243` |
| Context marker `WIX_MEMBERS_CONTEXT` | `wix-members-context.ts:108` |
| Contracts are `login-indicator`, `auth-callback`, `protected-page` — **no login/sign-up contract** | `packages/wix-members/plugin.yaml:3-18` |
| The only validator checks that the auth-callback page exists | `lib/validators/auth-callback-validator.ts:9-37`, `plugin.yaml:30-33` |
| That validator is a `JayHtmlValidatorFn` keyed on `headlessImports` | `auth-callback-validator.ts:12` |
| wix-server-client persists member tokens in `localStorage` — the single sanctioned place | `packages/wix-server-client/lib/wix-client-context.ts:37-42, 132, 148` |

So a jay-html validator cannot tell that a page is a login page: nothing in the jay-html says so. Only the page's TS does.

## Problem

An agent building a custom login or sign-up page on wix-members can today ship, with `jay-stack validate` green:

- a password field outside any `<form>` (password managers do not offer to save),
- `autocomplete="current-password"` on a sign-up page (the manager fills an old password instead of generating one),
- `type="text"` for the password,
- no way to reset a forgotten password,
- `localStorage.setItem('password', …)` "to remember the user".

## Prior Art / Adjacent Mechanisms

| Mechanism | Use here |
|-----------|----------|
| jay `ProjectValidatorFn` / `ProjectValidationContext` (`projectRoot`, optional `settings`) / `ProjectValidationFinding` (`severity`, `file`, `message`, `suggestion` — **no rule id**) from `@jay-framework/compiler-shared`. Runs once per project, **no parsed DOM**. Declared under the **`projectValidators:`** plugin.yaml hook. | Vehicle for the TS-only rules (reset, storage). Reads `.jay` suppressions itself through a new small loader (see Suppression); `loadWixMembersConfig` reads only `config/.wix-members.yaml` (`lib/config-loader.ts:15`) and is not reused for this. |
| jay `JayHtmlValidatorFn` / `JayHtmlValidationContext` (`body` = parsed DOM, `filePath`, `projectRoot`, `validationOverrides`). Declared under `validators:`. | Vehicle for the DOM rules. Page suppression comes pre-parsed in `validationOverrides['wix-members']`. |
| `<script type="application/jay-validations">` YAML keyed by plugin name | Page-level suppression, key `wix-members`. |
| The generic jay forms autocomplete validation (in progress) | Owns "a login field has *some* autocomplete token". We only own the **role** that only wix-members knows. |
| Existing `auth-callback-page` validator | Stays as is, exported from `lib/tools.ts` — the new handlers are exported next to it. |

### Null hypothesis — why not just a guide?

A guide is advice an agent may skip; every rule below is a fact a parser can decide from files in the project. Per the priority order (validation → guide → framework feature), we add the validator **and** the guide, and no new framework feature or contract.

Why not add a `login-form` contract so a jay-html validator could key on it? That is a framework-shaped addition (new contract, component, migration of existing pages) to buy a detection we can do from TS today. Rejected for now.

## Q&A

| Question | Answer |
|----------|--------|
| How does the validator find a "login page"? | See **Detection** below (TS AST, not regex). |
| Why two validators, not one? | A project validator gets no DOM; a jay-html validator gets no TS view. Both call the same memoized pure `findAuthPages(projectRoot)`, so the page list is identical whatever order jay runs them in. No shared mutable state. |
| A page that calls both? | Treated as both: needs one `current-password` field and one `new-password` field (a combined login/sign-up page). |
| Which input is "the password field"? | Every `<input type="password">`, plus any `<input>` whose `ref`/`name`/`id`, split into segments on `-`, `_`, `.` and camelCase boundaries, has a segment equal (case-insensitive) to `password`, `passwd` or `pwd`. So `password`, `newPassword`, `confirm-password` match; `passkey`, `passcode`, `bypass`, `compass` do not. |
| Does the shipped token storage get flagged? | No. `secret-in-storage` / `token-in-storage` scan only the project's `src/`; wix-server-client lives in `node_modules`. |
| Passkeys? | Wix supports passkeys only for Wix *account* (site owner) login. Headless member auth (OAuthStrategy login/register, identity `loginV2`) has no WebAuthn API. A `webauthn` rule would demand something agents cannot build. Deferred. |
| Does the generic jay check need to land first? | No. The rules are independent; together they give presence (jay) + role (wix-members). |
| Is `projectValidators` in the jay version wix consumes (`^0.26.5`)? | **Gate at step 1:** run `yarn install` first (Wix VPN; on a network/registry error stop and ask — do not retry). Then check the **installed published** packages in `node_modules` (not jay source): `@jay-framework/jay-stack-cli/dist` contains `projectValidators`, **and** `@jay-framework/compiler-shared` `.d.ts` exports `ProjectValidatorFn`, **and** a `.jay` file with a plugin-named `validations.wix-members` key is accepted by `jay-stack validate` (not rejected as an unknown key). If any fails, stop; the work waits for a jay release. `@jay-framework/compiler-shared` is added as a dev dependency of wix-members (type-only import). |

## Design

### Detection — `findAuthPages(projectRoot)`

Pure, TypeScript compiler API (lazy-loaded, see TL;DR 6). **Memoized per validate run**: cache key = `projectRoot` + a fingerprint of the scanned files (sorted `path:mtimeMs` list of **every scanned file**, including the one-level relative imports, and `src/**/*.ts(x)` for the storage rules). Accepted miss: an edit within the same mtime tick reuses a stale scan. Both validators in one run hit the cache; a later run (watch mode, edited file) gets a fresh scan. Computing the fingerprint stats every scanned file on each call; that cost is accepted.

**Source roots:** the default pages dir `<projectRoot>/src/pages` (and `<projectRoot>/src/` for the storage rules) is assumed. If `.jay` sets a custom `devServer.pagesBase` (nested key, resolved relative to `projectRoot`), the same `.jay` loader (`load-validation-suppressions.ts`, see Suppression) reads it and that dir replaces `src/pages`; otherwise the default applies. `src/` for the storage rules is not configurable.

How page code gets the context today (verified): import at `packages/wix-members/lib/components/login-indicator.ts:14`; chain `.withContexts(WIX_MEMBERS_CONTEXT)` → `.withInteractive(LoginIndicatorInteractive)` at `:64-66`. The interactive signature (`:35-41`) is `(props, refs, fastViewStateSignals, carryForward, ...contexts)`.

**Parameter-position rule** (jay public builder behavior of `@jay-framework/fullstack-component`'s `makeJayStackComponent`): the interactive function receives a fixed prefix, then the contexts in `.withContexts(...)` order.

- prefix = **2** `(props, refs, ...contexts)` when the chain has no `.withFastRender(...)`; **4** `(props, refs, signals, carryForward, ...contexts)` when it does.
- *i* = position of `WIX_MEMBERS_CONTEXT` in the `.withContexts(...)` arguments.
- The context is parameter **prefix + i**. If the function declares fewer than prefix + i + 1 parameters, the page is not an auth page.
- A `.withInteractive(Ident)` argument is resolved to its function declaration or `const` in the same file (as `login-indicator.ts` does); inline arrow/function arguments are read directly. Unresolvable → not an auth page.
- Step 1 confirms this order against the installed `@jay-framework/fullstack-component` types.

| Step | Followed |
|------|----------|
| Import | `WIX_MEMBERS_CONTEXT` from `@jay-framework/wix-members` (or its client entry), **including a renamed import** (`as MEMBERS`). |
| Context binding | Parameter of the `.withInteractive(...)` function at the position from the rule above. (`useContext(...)` lookups are out of scope.) |
| Aliasing | Direct member call `ctx.login(`; destructuring `const { login } = ctx` → `login(`; local variable `const m = ctx` → `m.register(`. |
| Files | `src/pages/**/page.ts(x)` plus **relative** imports one level deep (a call there counts if it receives the context as an argument). |

**Not followed:** deeper imports, package imports, re-exports, contexts stored in objects/arrays, dynamic property access (`ctx[name]`). **Consequence:** false negative — that page's DOM rules don't run (silence, never a wrong error). The guide tells agents to call `login`/`register` in the page file.

Output: `[{ pageJayHtml, calls: Set<'login'|'register'> }]`, plus `projectCallsLogin` and `projectCallsReset` for the project rules. `pageJayHtml` is `path.resolve` of the `page.jay-html` sibling of the `page.ts(x)`; a page.ts with no sibling `page.jay-html` is **skipped** (no finding). jay passes `ctx.filePath` **project-relative**, so the page validator matches by comparing `path.resolve(ctx.projectRoot, ctx.filePath)` with `pageJayHtml` (never `path.resolve(ctx.filePath)`, which resolves against process cwd).

### DOM rules — how the jay-html validator walks `body`

| Case | Handling |
|------|----------|
| `forEach` / `if` elements | Walked into like plain elements; a password field under them still counts. |
| Bound attribute (`type="{t}"`, `autocomplete="{a}"`) | Not decidable → accepted, no finding. |
| Nested / headless component tag | Not entered — its DOM is checked on its own file or not at all. |
| Suppression | Page rules: `validationOverrides['wix-members'][id] === true` or `.jay` `validations.wix-members[id] === true`. Project rules: `.jay` only. |
| Identifier input | In the same `<form>` as a password field: `type="email"`, else the first non-password `<input>` of `type` text/absent. |

### Rules

| Id | Severity | Trigger (exact) | Why it is sound |
|----|----------|-----------------|-----------------|
| `password-not-in-form` | error | On a login/register page, a password field has no `<form>` ancestor. | Static DOM fact. Chrome can detect formless fields heuristically, but a real `<form>` gives reliable save/update and Enter-to-submit (web.dev sign-in form guidance; Chrome article point #10). |
| `password-type` | error | A password field (matched by name/ref/id) has `type` other than `password`. | Static. Allowed exception: a show/hide toggle that binds `type` — see false positives. |
| `autocomplete-role` | error | Page-level role (form→handler binding isn't reliably determinable): **login only** — every password field on the page (in a form or not) `current-password`; **register only** — every password field on the page `new-password` (a confirm-password pair of two `new-password` is fine); **both** — checked per `<form>`: each form homogeneous, and at least one `current-password` form and one `new-password` form. | Role comes from which API the page calls — only wix-members knows it. |
| `identifier-autocomplete` | warning | The identifier input (defined above) has `autocomplete` **present** and containing neither `username` nor `email`. | Static; warning because the generic jay check also covers presence. Runs only on detected auth pages, and is skipped on pages with no `<form>` around a password field (no identifier is defined there). Only fires when a token is present but wrong (absent = jay's rule). |
| `no-password-reset` | warning | Project calls `login(` somewhere and nowhere in `src/` calls `sendPasswordReset(` (same detection as above). | Project-wide fact. Warning because a site may deliberately rely on Wix-hosted reset; suppressible. |
| `secret-in-storage` | error | In `src/**/*.ts(x)`, `<receiver>.setItem` whose receiver is `localStorage`, `sessionStorage`, `window.localStorage`/`window.sessionStorage` or `globalThis.localStorage`/`globalThis.sessionStorage`, and whose **key is a string literal** with a segment (same splitting as the password field) equal to `password`, `passwd`, `pwd` or `secret`. | AST check on literal keys only; value identifiers are not used (too noisy). |
| `token-in-storage` | warning | Same call, string-literal key with a segment `token`, or the adjacent segments `access`,`key` (e.g. `accessKey`). | wix-server-client already persists the session; app code doing it again duplicates a secret. Warning: names are heuristic. |
| *(deferred)* `webauthn-conditional-ui` | — | — | **Unsound today**: no member passkey API. Revisit when Wix exposes one. |

**Explicitly rejected as unsound:** "login page must link to sign-up" (product choice), "password minimum length attribute" (Wix enforces server-side), any regex over jay-html text instead of the parsed DOM.

### False-positive analysis

| Rule | Possible false positive | Handling |
|------|------------------------|----------|
| `password-not-in-form` | Custom component renders the form | Check after jay-html parsing of the page only; if the password input is inside a headless child, it is not on this page and not checked. |
| `password-type` | Show/hide toggle `type="{passwordInputType}"` | A bound (`{…}`) `type` is accepted. |
| `autocomplete-role` | Change-password page calls `login(` to re-auth | Suppress per page. |
| `no-password-reset` | Reset via Wix-hosted pages | Suppress in `.jay`. |
| `no-password-reset` | `sendPasswordReset(` is called from a file deeper than one relative import level (not followed by Detection) | Warns falsely; accepted for a warning — suppress in `.jay`, and the guide says to call it from the page or a direct helper. |
| `secret-in-storage` / `token-in-storage` | Key built dynamically | Not flagged (false negative accepted; we prefer silence over guessing). |
| `token-in-storage` | `refreshInterval`, `tokenCount` keys | Segment match: `refreshInterval` has no `token` segment → silent; `tokenCount` has segment `token` → **warns** (accepted: warning only, suppress in `.jay`). Both in the `near-miss/` fixture. |
| password field / `secret-in-storage` | `passkey`, `passcode`, `bypass`, `compass` | Whole-segment match → not matched. `near-miss/` fixture. |

### Suppression

Page (`<head>`):
```html
<script type="application/jay-validations">
  wix-members:
    autocomplete-role: true
</script>
```
Project (`.jay`):
```yaml
validations:
  wix-members:
    no-password-reset: true     # project rules: .jay only
```
A `.jay` entry for a **page** rule silences it on **every** page; use `application/jay-validations` to silence one page. There is no per-line comment marker.

Both validators read `.jay` through one new small loader, `lib/validators/load-validation-suppressions.ts`: parse `<projectRoot>/.jay` YAML with `js-yaml`, return `validations['wix-members']` (or `{}` when the file or key is missing), plus `devServer.pagesBase` when present (see Source roots).

### Message shape

The `src/pages/signup/page.jay-html:` prefix below is printed by the jay CLI from the finding's file; it is **not** part of `message`, which starts at `[wix-members/<id>]`.

```
src/pages/signup/page.jay-html: [wix-members/autocomplete-role] This page calls register(), so its password
field must use autocomplete="new-password" (found "current-password").
Suggestion: set autocomplete="new-password". See agent-kit/plugin/wix-members-direct-login.md.
```

### Examples

Bad sign-up (`src/pages/signup/page.jay-html`, page.ts calls `members.register(email, password)`):
```html
<div>
  <input ref="email" type="email" />
  <input ref="password" type="text" autocomplete="current-password" />
  <input ref="confirmPassword" type="password" autocomplete="new-password" />
  <button ref="submit">Sign up</button>
</div>
```
Findings: `password-not-in-form` (×2), `password-type` (on `password`), `autocomplete-role` (on `password`: register-only page, every password field must be `new-password`, form or not).

Good:
```html
<form ref="form">
  <input ref="email" type="email" autocomplete="username" />
  <input ref="password" type="password" autocomplete="new-password" />
  <input ref="confirmPassword" type="password" autocomplete="new-password" />
  <button type="submit">Sign up</button>
</form>
```

Bad storage (app `src/lib/remember.ts`):
```ts
localStorage.setItem('password', password); // secret-in-storage
```
The page.ts wires `refs.form.onsubmit(({ event }) => { event.preventDefault(); members.register(...) })` — handling the form `submit` event (not a button click) so Enter submits and password managers see a submit.

Good storage: store nothing — the member session is already persisted by wix-server-client.

### Guide — `agent-kit/plugin/wix-members-direct-login.md` (new)

Covers: when to use direct login vs Wix-hosted login; the form template above for login, sign-up, verify-email and reset pages; `autocomplete` roles; wiring submit through the form's `submit` event (so password managers see a submit); calling `sendPasswordReset`; never storing credentials or tokens; **passkeys — the gap**: Wix members have no passkey API, do not hand-roll WebAuthn against Wix members; one section per rule id. `wix-members-setup.md` links to it.

## Implementation Plan

1. **Dependency gate** (exact check in Q&A). If it fails, stop and report.
2. **RED tests first** — `packages/wix-members/test/credentials-validator/fixtures/<rule>/` one fixture project per rule (good + bad pages), plus `expected-findings.json` per fixture written as the **correct** findings (`[wix-members/<id>]` prefix, file, severity). Plus `clean/` → `[]`; `near-miss/` (passkey/passcode/bypass/compass names, `refreshInterval` key → silent; `tokenCount` key → one `token-in-storage` warning); `suppressed/` → `[]`, suppressing page rules via `application/jay-validations` and project rules via `.jay`; `no-jay-html/` — a `page.ts` calling `login()` with no sibling `page.jay-html` → skipped (no page findings); `suppressed-wrong-place/` — a project rule listed only in `application/jay-validations` still fires; `storage-receivers/` — one `setItem('password', …)` per receiver (`localStorage`, `sessionStorage`, `window.localStorage`, `window.sessionStorage`, `globalThis.localStorage`, `globalThis.sessionStorage`) → one `secret-in-storage` error each; `custom-pages-base/` — `.jay` sets `devServer.pagesBase` (nested, as jay reads it) and the auth page lives there → its page findings fire; a test running the `password-type` fixture with `process.chdir` to a directory other than the fixture dir still gets its findings (guards against resolving `filePath` against cwd); a unit test with the `typescript` import stubbed to fail expects the single `typescript-missing` warning. **Test harness:** each fixture is a project dir. For every `page.jay-html` returned by `findAuthPages`, the harness builds a `JayHtmlValidationContext`: `body` = the `<body>` element from `parse(source)` of `node-html-parser` (the parser jay's jay-html compiler uses, so the node shape is what jay hands validators; step 1 confirms against the installed `JayHtmlValidationContext` type), `filePath` = the page path **relative to the fixture dir** (as jay passes it), `projectRoot` = absolute fixture dir, `validationOverrides` = the page's `application/jay-validations` YAML parsed with `js-yaml` (already a wix-members dependency) and keyed by plugin (`{'wix-members': {...}}`), `headlessImports: []`. jay-html findings carry no `file`, so the harness attaches the fixture-relative page path to each before comparing; project findings use their own `file`. `node-html-parser` is added as a devDependency if absent. The `clean/` fixture also contains a copy of a token-storing `localStorage.setItem` outside `src/` to show only app `src/` is scanned. The harness keeps attribute case as written. Run: all fail (validator not present).
3. Implement `lib/validators/find-auth-pages.ts` (pure, memoized), `load-validation-suppressions.ts`, `credentials-page-validator.ts` (`JayHtmlValidatorFn`, DOM rules) and `credentials-project-validator.ts` (`ProjectValidatorFn`, reset + storage).
4. **Export, declare, package.json.** In `packages/wix-members/package.json` add `peerDependencies.typescript: ">=5"`, `peerDependenciesMeta.typescript.optional: true`, and devDependency `@jay-framework/compiler-shared` (absent today). Keep the existing `typescript` devDependency. Export `validateCredentialsPage` and `validateCredentialsProject` from `lib/tools.ts` next to `validateAuthCallbackPage` (published plugins load handlers by name from `<package>/tools`). Add `typescript` to `rollupOptions.external` in `vite.config.ts` so the lazy `import('typescript')` stays a runtime import and is not bundled; the external must apply to **both** vite build passes (client and `--ssr`), so verify neither output bundles `typescript`. Declare in `plugin.yaml`:
   ```yaml
   validators:
     - name: credentials-page
       handler: validateCredentialsPage
       description: Login/sign-up forms and autocomplete roles
   projectValidators:
     - name: credentials-project
       handler: validateCredentialsProject
       description: Password reset reachable, no secrets in storage
   ```
5. Write the guide; link from `wix-members-setup.md`.
6. CHANGELOG under `## Unreleased` (no version bump).
7. Demo (below). 8. Append Implementation Results, set status `[Implemented]` in this log and `readme.md`.

## Demo plan (recorded)

- Copy a QA testbed app that uses wix-members into the workspace as `qa-testbed/`, install there against an `npm pack` tarball of wix-members (published `dist/`, as consumers see it).
- Add a `signup` page with the **bad** markup above. Record: `jay-stack validate` lists the errors naming the guide.
- The **good** page handles the form `submit` event with `preventDefault` (see Examples), so pressing Enter submits.
- Fix to the **good** markup; `validate` passes.
- In the browser, show the rendered DOM (devtools or an on-screen assert): password inputs inside `<form>`, `type="password"`, `autocomplete="new-password"`, identifier `autocomplete="username"`.
- Submit the form with Enter as a visitor. **Prefer a login page with an existing QA member** (creates no data). **Ask first:** its credentials must come from the user; never guess or create them. If registering is needed and `register` returns `emailVerificationRequired`, the demo stops at that state (it still proves the form submits). **Open question — ask first:** registering creates a QA member and deleting it needs the user's explicit permission; don't register until granted.
- Video at workspace root: `credential-lifecycle-<date>.webm`.
- **Optional manual check (not a done criterion):** in a normal Chrome profile, the save-password prompt appears. The Playwright recorder cannot capture browser-UI prompts.

## Verification Criteria

- Every fixture's findings equal its `expected-findings.json` exactly.
- From the `npm pack`ed install in the testbed copy, `jay-stack validate` runs the validators (no `Cannot find module 'typescript'`); with `typescript` absent there, it prints the single `typescript-missing` warning.
- `clean/` and `suppressed/` produce zero findings.
- wix-server-client's own `localStorage` use produces no finding when run against a project that depends on it.
- Each message contains its rule id and `wix-members-direct-login.md`.
- Existing wix examples still pass `npm run validate` (or any new finding is a real defect fixed or justified).
- Demo video shows `validate` red → green and the asserted form/autocomplete attributes.

## Scope pre-mortem

| Risk | Mitigation |
|------|-----------|
| Pages call `login()` from a helper file, not `page.ts` | See Detection: one level of relative imports; beyond that, false negative accepted and documented in the guide. |
| Overlap noise with the generic jay check | We only fire when a token is present but wrong-role; absence is jay's rule. |
| `projectValidators` not in consumed jay | Step 1 gate. |
| `typescript` absent in a consumer | Optional peer + lazy import + one clear warning. |
| Storage name heuristics too eager | Token rule is warning only; literals/identifiers only. |
| Scope creep into passkeys | Deferred rule, explicit. |

## Trade-offs

- TS-scan detection over a new contract: zero migration, but detection depends on code shape.
- Warnings for reset and token storage: avoids blocking legitimate setups at the cost of being ignorable (suppression keeps the decision explicit).

## Feedback loop (jay-feedback)

- **Validation:** yes — the seven rules above (wix-members plugin: one jay-html + one project validator).
- **Agent-kit guide:** yes — `wix-members-direct-login.md` (plugin agent-kit), including the passkey gap.
- **Framework (jay):** nothing new; uses existing `projectValidators`. The generic autocomplete-presence rule remains with the generic jay forms autocomplete validation.

## Implementation Results (2026-11-23)

**Step 1 gate: passed** against the installed published packages, all 0.26.5:
- `@jay-framework/compiler-shared` `.d.ts` exports `ProjectValidatorFn`, `ProjectValidationContext` and `ProjectValidationFinding`.
- `jay-stack-cli/dist` runs `projectValidators` with `ctx = { projectRoot }`.
- A `.jay` with `validations.wix-members` is accepted by `jay-stack validate`, with no unknown-key error (checked in the testbed copy).
- `fullstack-component` builder types confirm the parameter rule: `.withFastRender` prepends `Signals, CarryForward` to the contexts, and `ComponentConstructor` is `(props, refs, ...contexts)`.
- jay passes `filePath` as the project-relative `relativePath` (`jay-stack-cli` dist, validator context construction).

**Shipped:** `lib/validators/{credential-rules, load-typescript, load-validation-suppressions, find-auth-pages, credentials-page-validator, credentials-project-validator}.ts`; exports in `lib/tools.ts`; `plugin.yaml` `validators: credentials-page` + `projectValidators: credentials-project`; `typescript` optional peer (`>=5`) and vite external (verified: `dist/tools.js` keeps `await import("typescript")`, not bundled); devDependencies `@jay-framework/compiler-shared` and `node-html-parser`; guide `agent-kit/plugin/wix-members-direct-login.md`, linked from `wix-members-setup.md`; `CHANGELOG.md` (new) under `## Unreleased`. No version bump.

**Tests.** RED first: the suite failed (validator modules absent). Then **30/30** in wix-members: 16 fixture projects, the message/guide test, the cwd test, the typescript-missing test, and the 11 existing tests. Fixtures: the 7 rules, `detection/` (renamed import, `.withFastRender` prefix 4, second context, destructuring, alias, inline arrow, one-level helper; negative: too few params, context imported from a non-wix-members module), `clean/` (with a `vendor/` `setItem` outside `src/`), `near-miss/`, `suppressed/`, `suppressed-in-jay-config/`, `suppressed-wrong-place/`, `no-jay-html/`, `storage-receivers/` (6 receivers + `cache.setItem` ignored), `custom-pages-base/`. `yarn build` and `yarn test` at the repo root are green. All 6 examples pass `npm run validate`, and both new validators run there with no findings (whisky-exchange shows `wix-members/credentials-page` and `credentials-project` "No issues found"). That also covers "wix-server-client's own localStorage produces no finding".

**Deviations.**
- `findAuthPages` also returns `loginCallers` (used as the `file` of `no-password-reset`: the first page that calls `login`) and the storage writes (one scan, one memo). `projectCallsReset` counts every `page.ts`, including ones without a sibling `page.jay-html`.
- A combined login + sign-up page: password fields outside a form are left to `password-not-in-form` and not checked for role. A mixed form gives one finding. The "needs both roles" finding is only added when no form is mixed.
- `autocomplete-role` reports a **missing** token on a password field too ("found no autocomplete"): the design's trigger is "every password field … `current-password`", and only `identifier-autocomplete` defers absence to jay.
- Nested component tags are recognised by a `:` in the tag name or an uppercase first letter.
- Packaging fix: `agent-kit` was missing from `package.json` `files`, so no wix-members guide reached consumers. Added. Verified in the packed tarball.
- The test stub for "typescript missing" makes `loadTypeScript` throw the module's own `TypeScriptMissingError` (the shape a failed `import('typescript')` takes).

**Late author edits, re-checked while implementing** (never re-reviewed):
- `.jay` `devServer.pagesBase` is nested, as jay reads it (`getConfigWithDefaults`). Covered by `custom-pages-base/`.
- `.jay` is parsed with `js-yaml` (an existing dependency).
- The clarifications hold: `filePath` project-relative, page.ts with no sibling jay-html skipped, project rules `.jay`-only. Each has a fixture.

**Demo** (QA testbed copy in the workspace, `qa-testbed/`, installed from a `yarn pack` tarball of wix-members, so the packaging is what consumers get; jay packages 0.26.5 in the copy only):
- A `signup` page with the bad markup: `jay-stack validate` printed exactly the Examples findings, `password-not-in-form` ×2, `password-type` and `autocomplete-role`, each naming the guide.
- Fixed markup: both credential validators "No issues found". The only remaining error is the testbed's known `/book` `BOOKINGS-ADDRESS-UNBOUND`.
- In the browser, a DOM check showed the email input with `autocomplete=username` and two password inputs with `autocomplete=new-password`, all inside a form.
- A visitor pressed Enter, the form `submit` handler ran (`preventDefault`), and `register` returned `{"status":"captchaRequired"}` from the QA site.
- **No member was created.** A Members API query for `qa+members-dl63*` found 0, so nothing needed deleting.
- Finding while demoing: a page that only uses `WIX_MEMBERS_CONTEXT` must import a wix-members headless contract (here `login-indicator`), or the context is not provided and hydration fails. Added to the guide's Templates section in this change.
- Not done live: the `typescript`-absent run in the testbed (covered by the unit test).

**Video:** `wix-63-credential-lifecycle-20261123.webm` (workspace root, narrated, 73 s).

**Follow-up (not in this log):**
- A validation: a page whose TS uses `WIX_MEMBERS_CONTEXT` but has no wix-members headless import (the guide now explains it).
- Sign-up on a captcha-enabled site returns `captchaRequired`. The direct-login guide could say how to handle it.

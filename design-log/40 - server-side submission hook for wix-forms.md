# 40 - Server-Side Submission Hook for wix-forms

Status: Approved (2026-10-26)

Builds on **DL#39 (General Forms Infrastructure)**: its value store, `control` channel, hidden fields, `submitForm` action, and the **structured submit result** that DL#39's own planned defect fix introduces (DL#39 → Implementation Results → *Known defect found in review + planned fix*). Generic: any Jay project, no downstream site named. Paths are relative to `packages/wix-forms/lib/` unless stated.

## Decisions for the Implementer (TL;DR)

- **Server-side Wix calls run as the site by default, and as the caller when the request carries the session cookie.** See *Jay Wix plugins: site by default, the caller when the request carries a session*.
- **Wix's documented headless session pattern, one path everywhere (localhost included).** The browser's OAuth tokens are mirrored into an **httpOnly, server-set** cookie, as in Wix's headless Quick Start ([quick-start](https://dev.wix.com/docs/go-headless/tutorials-templates/java-script-sdk-tutorials/quick-start)). No undocumented endpoint, no dev-only path.
- **Session action (wix-server-client):** `wixServerClient.syncSession({ tokens } | { clear: true })`. It verifies `tokens.accessToken` with the documented `oauth2/token-info` ([token-info](https://dev.wix.com/docs/api-reference/app-management/oauth-2/token-info)): all four checks (`active`, `clientId` = this site's, `subjectType` ∈ {VISITOR, MEMBER}, non-empty `subjectId`). Then it sets cookie `wix_session` (access + refresh tokens; `HttpOnly; SameSite=Lax; Path=/; Secure` except on `http://localhost`; `Max-Age` 30 days, MUST-VERIFY against the refresh-token lifetime). A failed check clears the cookie.
- **The browser syncs from one place:** wix-server-client's `storeTokens` (the only code that persists tokens) calls `syncSession` whenever the access token changed. That covers login (wix-members' callback), SDK renewal, and logout (fresh visitor tokens). localStorage stays the client-side source; the cookie mirrors it.
- **Server read (wix-server-client):** `resolveRequestIdentity(request.cookies)` → `{ caller, client }`. `client` = `createClient({ auth: OAuthStrategy({ clientId, tokens }) })` ([oauth-strategy](https://dev.wix.com/docs/sdk/core-modules/sdk/oauth-strategy)), so Wix's own permissions apply. `caller` is **lazy**: one `token-info` call on first access, memoised per request. The server never refreshes or re-sets the cookie; the browser keeps it fresh.
- **Upstream prerequisite:** jay's request-cookie access for actions (`.withRequest()` → `request.cookies`, `request.setCookie`, `request.clearCookie`), with jay's same-origin check on actions.
- **Any token-info failure** (non-200 outside the invalid-token set, network, 5 s timeout) → logged generic failure; the hook does not run. Cookie and token values are never logged.
- **A `VISITOR` caller proves a browser session, not a person.** A flow that needs identity requires `caller.type === 'MEMBER'` (Q19).
- **One hook per form replaces DL#39's augmenter.** `WIX_FORMS_SUBMIT_HOOKS` is a `formId → hook` map, looked up own-property only. A hook gets `{ formId, values, caller, client, submit }`; `submit()` still posts with the site client. `submit(values?)` POSTs to Wix at most once and resolves `void`; an ignored call rejects with the exported `SubmitIgnoredError`.
- **A hook rejects only with `ActionError(code, message)`**, which is form-level. Wix's own per-field violations, captured inside `submit()`, still come back as `fieldErrors` (DL#39's fix). A hook-raised per-field rejection is deferred (§Trade-offs).
- **No throw path.** `runSubmission` **returns** every outcome as `{ success: true, redirectTo? } | { success: false, message?, fieldErrors? }`. The client has one result path, plus a catch for transport errors that shows the generic message.
- **Explicit attempt state** (`idle → pending → succeeded | failed`, plus `sealed`). The attempt is sealed when the hook settles. **Once `submit()` was called, the Wix outcome alone decides the result**, so a swallowed and a rethrown `submit()` failure give the same result. Five rows (§Design 3).
- **Client-side submit validation skips hidden fields.** Wix re-validates them, and its errors reach `statusMessage`. This lands in DL#39's fix (Phase 0), because a required hidden field filled by the server would otherwise block submit silently.
- **Double-submit guard.** `setIsSubmitting(true)` runs synchronously after validation and before the first `await`. It stays set while a redirect navigates; `resetForm` and a bfcache `pageshow` clear it.
- **Hooks are registered inside `makeJayInit().withServer(...)`.** A bare top-level `registerService` in the project's `src/init.ts` ships the hook to the browser.
- **`redirectTo`.** A hook may return `{ redirectTo: '/path?ref=…' }`. The client checks it once, with `toSitePath`, before `window.location.assign`.
- **Wix submissions are not a trust boundary.** The consumer's own server-written record is the source of truth (Q18).
- **jay-feedback:** an agent-kit section, no validation (§Agent Feedback Loop).

---

## Background

DL#39's submit chain:

1. **Browser.** `WixFormInteractive` (`components/wix-form.ts`, `refs.submitButton?.onclick`, :229) validates **every** projected field, hidden ones included (:240-257), then calls `submitForm({ formId, values })` (:261). Its catch branch (:264-272) is dead code (DL#39's known defect) and falls back to `describeSubmitError` (:422-428).
2. **Action.** `submitForm` (`actions/forms-actions.ts:14-34`) optionally merges `WIX_FORMS_SUBMISSION_AUGMENTER.augment()` over the values (:22-30), calls `forms.createSubmission`, and returns `{ success: true }`.
3. **Wix API.** `createFormSubmission` (`wix-apis/create-submission.ts`) POSTs `/forms/v4/submissions` through `wixFetch` with the **site** client and returns `void`. A non-2xx answer throws `WixApiError(status, path, responseBody)`.

The server Wix client is a site-wide singleton. The browser's OAuth tokens (visitor, or member after login) live in localStorage (`provideWixClientContext`, `wix-server-client` `wix-client-context.ts:76-125`, persisted only by `storeTokens`, :38). They never reach the server today.

DL#39's planned fix creates `submission/run-submission.ts`, which maps Wix field violations on the server and **returns** `{ success: false, fieldErrors }`. This DL extends that module and that result.

### Rejected route: Wix-hosted `smSession` cookies (probe, 2026-10-26)

A temporary probe in `examples/forms-members-testbed` (to be removed; nothing depends on it) showed that on a Wix-hosted domain, Wix sets its own session cookies (`smSession`, httpOnly) after member login, and that a Wix-internal site endpoint can exchange them for the member's identity. **Rejected:** that endpoint is undocumented (not acceptable in open-source plugins), and the cookies exist only on Wix-hosted domains, never on localhost.

### Jay Wix plugins: site by default, the caller when the request carries a session

| Where the Wix call runs | Credential | Whose permissions apply |
|---|---|---|
| Server, default (actions, slow/fast render, plugin services) | `WIX_CLIENT_SERVICE`, built once at init from the API key / app config | **The site** (elevated) |
| Server, request with a `wix_session` cookie | `resolveRequestIdentity(request.cookies).client` | **The visitor/member**; Wix's permissions apply |
| Browser (interactive phase) | `WIX_CLIENT_CONTEXT`, the OAuth tokens in localStorage | **The visitor/member** |

**Worked example — wix-data.** On the server, `WIX_DATA_SERVICE` uses `WIX_CLIENT_SERVICE` (`packages/wix-data/lib/init.ts`), so collection member-only rules are **not** applied. In the browser, `WIX_DATA_CONTEXT` (`lib/contexts/wix-data-context.ts`) runs as the visitor/member and they **do** apply. Server code that wants Wix to enforce them uses the request client explicitly; this DL adds the primitive and switches no plugin's default.

## Problem

### Driving use case (generic)

A **"request a visit"** form backed by a Wix Form. Custom UI writes the visitor's choices into form fields through DL#39's `control` channel. On submit, the server must:

1. identify the verified caller;
2. re-check availability, and reject with a message if the slot is taken;
3. write a reservation record;
4. add a server reference to the submission, usually in a hidden, possibly required, field;
5. submit;
6. delete the reservation if the submit fails;
7. redirect to a page that shows the reference.

### What the plugin lacks

1. **No verified caller (1).** The action receives only `{ formId, values }`.
2. **No transaction around submit (2–6).** The augmenter is a values transform that runs before submit. It has no failure path and no handle on the submit call.
3. **A required hidden field blocks submit (4).** Client validation checks hidden fields (`wix-form.ts:243-257`). `projectFormFields` keeps `required` for them (`utils/project-form-fields.ts:91,98`), and their sub-contract has no `error` tag (`generators/contract-utils.ts:98-111`). An empty, server-filled reference field fails silently on the client.
4. **No post-submit outcome (7).** Success only sets `isSubmitted`.

## Prior Art / Adjacent Mechanisms

- **DL#39 4b augmenter** (`services/wix-forms-submission-augmenter.ts`). **Partially solves** the problem. Its registration pattern (a project-provided marker, resolved with `hasService`) is reused; its shape is **subsumed** by the hook.
- **jay action transport** (`@jay-framework/stack-server-runtime` `ActionRegistry`; `@jay-framework/stack-client-runtime` `createActionCaller`). **Constrains** the design. A thrown error crosses as `{ code, message }` only, and fields such as `responseBody` are dropped. A **returned** value rides through intact, so outcomes are returned. The caller aborts after 30 s by default (configurable with `setActionCallerOptions({ timeout })`) and throws `ActionError('TIMEOUT')`, and a `TypeError` from `fetch` becomes `ActionError('NETWORK_ERROR')`.
- **jay's `ActionError` convention** (`@jay-framework/fullstack-component`). **Constrains** the design: `throw new ActionError(code, message)` is an action's user-facing error, and DL#39's guide promises that an augmenter throw "is surfaced as a submit error".
- **Headless component ↔ page events** (`@jay-framework/stack-client-runtime` `makeCompositeJayComponent`). **Rules out** an event-based outcome: a plugin's `createEvent` emitter is discarded, so the page cannot subscribe to it.
- **Server-returned redirect.** **Solves step 7.** wix-bookings (`booking-flow.ts:268-271`) and wix-cart (`cart-page.ts:308-309`) navigate to a server-returned URL.
- **`@wix/sdk` `getTokenInfo`** (`build/get-token-info.js`, internal: not reachable through the package `exports`). **Prior art for step 1.** It POSTs `{ token }` as JSON to `/oauth2/token-info` with no `Authorization` header, and types the body as `{ active: boolean; subjectType: 'APP' | 'USER' | 'MEMBER' | 'VISITOR' | 'UNKNOWN'; subjectId: string; exp: number; iat: number; clientId?: string; siteId: string; instanceId?: string }`. It cannot be reused: it is not exported, and it throws on any non-200 with a message only, so a status cannot be classified.
- **wix-members `memberAccessToken`** (`packages/wix-members/lib/utils/member-access-token.ts`). **Solves the client token read**, minus its `loggedIn()` gate. It renews through `auth.getAuthHeaders()` and persists a renewed token through the context's public `setTokens` (`wix-members-context.ts:121-122`), which calls `storeTokens` (`wix-client-context.ts:107-110`). wix-forms copies this pattern, so no `WixClientContext` change is needed.
- **`@wix/sdk` `OAuthStrategy`** (`build/auth/oauth2/OAuthStrategy.js:45-60`). **Constrains** what a caller means. `getAuthHeaders` renews an expired token, and on any renewal failure falls back to a fresh anonymous visitor grant. `isTokenExpired` (`build/tokenHelpers.js`) is `expiresAt < now` in seconds, with **no skew margin**.
- **`wix-server-client` server init** (`init.ts:10-19`) returns `{ oauthClientId }`. The runtime stores it under the plugin name, and `getClientInitDataForKey` (`@jay-framework/stack-server-runtime`, public) reads it server-side. **Solves Q3** without a second `loadConfig()` YAML read.
- **Wix headless Quick Start** ([quick-start](https://dev.wix.com/docs/go-headless/tutorials-templates/java-script-sdk-tutorials/quick-start)). **Solves the session.** After `getMemberTokens()` the tokens go into a `session` cookie on the site's domain; server middleware creates visitor tokens with `generateVisitorTokens()` when there is none. We keep the cookie, but the browser stays the token owner (Q4).
- **`OAuthStrategy({ clientId, tokens })`** ([oauth-strategy](https://dev.wix.com/docs/sdk/core-modules/sdk/oauth-strategy)). **Solves the caller-scoped server client.**
- **jay's request-cookie access for actions** (upstream, in design): opt-in `.withRequest()` gives `(input, request, ...services)` with `request.cookies`, `request.setCookie(name, value, opts)`, `request.clearCookie(name)`. **Required.** Fast render already receives cookies.
- **compiler-jay-stack** (`@jay-framework/compiler-jay-stack`). **Constrains placement and registration.**
  - `isActionImport` treats any specifier containing `.actions`, `-actions`, or `/actions/` as an action module and rewrites its imports in client builds.
  - `jayStackCompiler` strips only `.withServer(...)` of a `makeJayInit()` chain in client builds. The dev server loads the project's `src/init.ts` into the page's client script, so top-level code there reaches the browser.

### Null hypothesis per new surface

| New surface | Existing primitive | Why it doesn't suffice |
|---|---|---|
| `syncSession` + `resolveRequestIdentity` (wix-server-client) | `WIX_CLIENT_SERVICE`; Quick Start middleware | The site client is not the caller. The Quick Start mints tokens server-side, but here the browser already owns them (localStorage); the server only mirrors them. Every wix-* plugin can use it, so it lives in wix-server-client; plain functions + one action, no service marker. |
| `token-info` verifier (in wix-server-client) | `@wix/sdk` internal `getTokenInfo` | Not exported; can't classify statuses. |
| `WIX_FORMS_SUBMIT_HOOKS` | augmenter | No submit handle, no failure path, not per form. It **replaces** the augmenter, so the net count of markers is 0. |
| `redirectTo` | `createEvent`; `isSubmitted` | Events don't reach the page. `isSubmitted` carries no data. |

## Questions and Answers

**Q1 — How does the server learn who is submitting?**
A: From the `wix_session` cookie, which the server set only after `token-info` verified the tokens. `caller` is re-verified lazily with `token-info` (Q23). Null hypothesis: send the token in each action body (the previous revision) — rejected: every plugin would repeat it, render-time code couldn't use it, and there is no caller-scoped server client. **Answered.**

**Q2 — Where does it live?**
A: **wix-server-client**: `lib/session/` with `syncSession` (action), `resolveRequestIdentity`, and `verifyAccessToken` (token-info). It owns the tokens, the OAuth client id and `storeTokens`. **wix-members** needs no new code: login and logout already go through `setTokens` → `storeTokens` (`wix-members-context.ts:121-122`); Phase 1 verifies that its logout path does too. **Answered.**

**Q3 — Where does the server get the site's OAuth client id?**
A: wix-server-client's own config (`config.oauth.clientId`), already loaded at init. **Answered.**

**Q4 — Who owns the tokens, and how do the two copies stay in sync?**
A: **The browser owns them** (localStorage); the cookie mirrors. `storeTokens` calls `syncSession` when `accessToken.value` differs from the last synced one (fire-and-forget; a failure is logged without values and retried on the next change). The server **never refreshes**: refresh-token rotation (unverified) would otherwise invalidate the browser's copy. Before a cookie-dependent action, a client calls `ensureSessionFresh()` (exported by wix-server-client's client side): renew via `auth.getAuthHeaders()` if expired → `storeTokens` → awaited `syncSession`. wix-forms calls it before `submitForm`. **Logout in another tab:** that tab syncs fresh visitor tokens, so the shared cookie is the visitor's for all tabs; other tabs' in-memory clients update via a `storage` event listener in `provideWixClientContext`. **Answered.**

**Q5 — What happens when identity resolution fails?**
A:
- **No cookie / unparsable cookie** → `{ caller: undefined, client: undefined }`, no fetch.
- **`token-info` 200 failing a check, or an invalid-token status** (Phase 1 fixtures) → `caller: undefined`; `client` is still returned (Wix rejects a bad token on use).
- **Any other non-200, network error, 5 s timeout** → `caller` rejects; `runSubmission` logs L1 and returns the generic message without running the hook.
- Identity is resolved **only for a hooked form**.

**Answered.**

**Q6 — Keep the augmenter alongside the hook?**
A: No. `augment` is `submit({ ...values, ...derived })`. DL#39 is unreleased, so the migration is small (§Design 5). **Answered.**

**Q7 — How is a hook scoped to a form?**
A: The service value is `Record<formId, SubmitHook>`. Form ids come from the generated `forms.yaml` (`setup.ts:99-104`). The `formId` comes from the browser, so the lookup is `Object.hasOwn(hooks, formId)`, which keeps `'constructor'` from resolving. **Decision:** `formId` is not case-normalised; a case variant that misses the hook only reaches Wix, which Q18 already accepts. **Answered.**

**Q8 — How does a hook reject, and how do Wix's per-field rejections reach the user?**
A: A hook rejects with `throw new ActionError(code, message)`, which is form-level. `runSubmission` **returns** its message, which also bypasses the old `includes('403')` rewrite. Wix's field violations are read from the attempt's own recorded failure, the real `WixApiError`, so the result does not depend on what the hook rethrows. **Answered.**

**Q9 — How does the page act on the outcome?**
A: Through `redirectTo`, which the hook returns and the plugin's client follows. **Answered.**

**Q10 — Is a channel needed for hook-only inputs?**
A: **No.** Choices are form fields, server-derived values go through `submit(values)` into hidden fields, and identity comes from the session cookie (Q1). **Answered.**

**Q11 — What if `submit()` is called twice, or after the hook settled?**
A: Neither call POSTs. `submit` is a plain (non-`async`) function that checks and changes the attempt state synchronously, so `Promise.all([submit(), submit()])` POSTs once. The attempt is sealed when the hook settles, so a `submit()` scheduled for later (a timer, an un-awaited chain) is ignored, because its result could never reach the user. Each ignored call is logged and rejects with the exported `SubmitIgnoredError` (a handler is already attached), so a hook's `catch` can tell it from a Wix rejection. **Answered.**

**Q12 — Why not trust the cookie without token-info?**
A: The cookie is httpOnly and set only by `syncSession` after verification, but a user can still edit their own cookie. For `client` that is harmless (a forged token fails at Wix). For `caller`, app logic keys records on `caller.id`, so it is verified (lazily). `wix_auth_role` stays a forgeable hint. **Answered.**

**Q13 — Does the hook get a caller-scoped Wix client?**
A: Yes: `client`, built from the cookie. `submit()` still posts with the **site** client: a member-only form permission would otherwise reject visitors, and the behaviour must not change for plain forms. **Answered.**

**Q14 — Who prevents double-booking a slot?**
A: The consumer's own write, for example with a unique key on slot + date. **Answered.**

**Q15** — Withdrawn — merged into Q4.

**Q16 — What changes for code that threw from the augmenter?**
A: An `ActionError` is still shown as the message. **Any other error is logged and shown as `SUBMIT_FAILED_MESSAGE`.** This is a user-visible change for an augmenter that threw a plain `Error` (its text used to reach the user), and a Wix 403 no longer shows the permission hint (the server log keeps it). An `ActionError` thrown by the hook *after* `submit()` was called is logged, not shown (Q17). The Phase 3 migration snippet and DL#39's Implementation Results state this. **Answered.**

**Q17 — What if the hook throws after `submit()` succeeded?**
A: The submission stands. The throw is logged, and the result is `{ success: true }` with no `redirectTo`. A failure result would invite a retry that duplicates the submission. **Answered.**

**Q18 — Can a browser skip the hook by calling Wix directly?**
A: Probably. A script holding a visitor token can likely POST `/forms/v4/submissions` itself. **Rule:** a hook gates the consumer's own records. Hidden-field values in a Wix submission are display data, never proof. **Answered.**

**Q19 — What does a verified caller prove?**
A: `MEMBER` proves a logged-in member. `VISITOR` proves only a session, which anyone can self-mint with the public client id, so it is never spam protection or a person. A member whose refresh fails becomes a new visitor. A hook that needs a person checks `caller?.type === 'MEMBER'`. **Answered.**

**Q20 — How are field errors on hidden or unknown fields shown?**
A: Per DL#39's `presentSubmitRejection`: visible fields get `errorByTarget` / `invalidByTarget`. Every other target is joined into `statusMessage` as `label || target: message`, after `result.message`. With nothing to show, the message is `SUBMIT_FAILED_MESSAGE`. **Answered.**

**Q21 — Where do the modules live?**
A: **Server-only (wix-forms):** `submission/run-submission.ts`, imported only by `actions/forms-actions.ts` through `../submission/run-submission.js` (does not match `isActionImport`). wix-server-client's `session/` server modules are exported from its server `index.ts` only; `ensureSessionFresh` from `index.client.ts`. **Client (wix-forms):** the client-safe `components/submit-outcome.ts`, which both sides import. No client file imports `submission/`. **Answered.**

**Q22 — Cookie content and attributes?**
A: Name `wix_session` (not the Quick Start's generic `session`, to avoid clashing with a site's own). Value: base64url JSON of `{ accessToken, refreshToken }`, so a later server refresh stays possible without a cookie format change. `HttpOnly; SameSite=Lax; Path=/; Secure` (omitted only for `http://localhost`); `Max-Age` = 30 days, ⚠️ MUST-VERIFY against Wix's refresh-token lifetime. ⚠️ **MUST-VERIFY size:** both tokens must fit in ~4 KB; if not, store the access token only (the null hypothesis, kept as fallback). **Answered, gated.**

**Q23 — token-info per request?**
A: Lazily: only when `caller` is read (hooked submit), memoised per request. `client` needs no check: Wix rejects bad tokens. No cross-request cache. **Answered.**

**Q24 — An expired access token in the cookie?**
A: The server does not refresh (Q4). `token-info` reports `active:false` → `caller: undefined`; `client` calls fail at Wix. `ensureSessionFresh()` before the action prevents this in practice. **Answered.**

**Q25 — CSRF and session fixation?**
A: jay's same-origin check on actions, plus `SameSite=Lax`. Without the same-origin check, a cross-site page could call `syncSession` to plant its own tokens (login CSRF), so ⚠️ MUST-VERIFY the jay capability enforces it for `.withRequest()` actions. **Answered, gated.**

## Design

### 1. Session (wix-server-client)

**Server: `lib/session/`.**

```ts
export interface VerifiedCaller { type: 'VISITOR' | 'MEMBER'; id: string }
export interface RequestIdentity {
  /** Verified lazily with token-info on first await; memoised. */
  readonly caller: Promise<VerifiedCaller | undefined>;
  /** OAuthStrategy({ clientId, tokens }) from the cookie; undefined without a cookie. */
  client: WixClient | undefined;
}
export const WIX_SESSION_COOKIE = 'wix_session';
export function resolveRequestIdentity(cookies: Record<string, string>, fetchImpl = fetch): RequestIdentity;
export function verifyAccessToken(accessToken: string, oauthClientId: string, fetchImpl = fetch): Promise<VerifiedCaller | undefined>;
export const syncSession = makeJayAction('wixServerClient.syncSession')
  .withRequest()
  .withHandler(async (input: { tokens: Tokens } | { clear: true }, request) => { /* verify → setCookie | clearCookie */ });
```

- `verifyAccessToken`: JSON `POST { token }` to `https://www.wixapis.com/oauth2/token-info`, no `Authorization`, 5 s timeout (shape typed after `@wix/sdk`'s internal `getTokenInfo`); 200 → the four checks; status in `INVALID_TOKEN_STATUSES` (= Phase 1 fixtures) → `undefined`; other non-200 → `WixApiError(status, '/oauth2/token-info')`; network/abort propagates; never logs.
- `syncSession`: `clear` → `clearCookie`, returns `{ ok: true }`. Otherwise verify; a caller → `setCookie(WIX_SESSION_COOKIE, encode(tokens), attrs per Q22)`, returns `{ ok: true, callerType }`; `undefined` → `clearCookie`, `{ ok: false }`; a throw propagates as a generic action error. `plugin.yaml` lists the action.

**Client.** `storeTokens` triggers `syncSession` on an access-token change; `ensureSessionFresh(): Promise<void>` is exported from `index.client.ts` (Q4), reusing wix-members `memberAccessToken`'s renewal pattern.

### 2. The hook service

New `services/wix-forms-submit-hooks.ts`, which replaces `wix-forms-submission-augmenter.ts`:

```ts
export interface SubmitHookInput {
  formId: string;
  /** Values as sent by the browser, keyed by field target. UNTRUSTED: re-validate. */
  values: Record<string, FieldValue>;
  /** Verified with Wix; undefined = no proof. A VISITOR proves a browser session only. */
  caller: VerifiedCaller | undefined;
  /** Wix client acting as the caller (from the session cookie); undefined without one. Q13. */
  client: WixClient | undefined;
  /**
   * Submit to Wix, at most once, before the hook settles. `values` replaces the submitted values
   * (default: `input.values`). Rejects when Wix rejects, or with `SubmitIgnoredError` when ignored. Await or return it.
   */
  submit(values?: Record<string, FieldValue>): Promise<void>;
}
export interface SubmitHookOutcome { /** Site path ('/…') to navigate to after success. */ redirectTo?: string }
export type SubmitHook = (input: SubmitHookInput) => Promise<SubmitHookOutcome | void>;
export type SubmitHooks = Record<string, SubmitHook>; // formId → hook
export const WIX_FORMS_SUBMIT_HOOKS = createJayService<SubmitHooks>('WixFormsSubmitHooks');
```

The project provides it, so it is not listed in wix-forms' `plugin.yaml`, the same as the augmenter today.

### 3. `runSubmission`: the orchestration (pure, node-testable)

This extends DL#39's `submission/run-submission.ts`.

```ts
export interface SubmitDeps {
  createSubmission(formId: string, values: Record<string, FieldValue>): Promise<void>;
  /** Called only for a hooked form. */
  resolveIdentity(): Promise<{ caller: VerifiedCaller | undefined; client: WixClient | undefined }>;
  hook?: SubmitHook;
}
export async function runSubmission(request: SubmitRequestInput, deps: SubmitDeps): Promise<SubmitFormResult>;
export function selectHook(hooks: SubmitHooks | undefined, formId: string): SubmitHook | undefined; // Object.hasOwn
```

In `types.ts`:

```ts
export interface SubmitRequestInput { formId?: string; values: Record<string, FieldValue> }
export type SubmitFormResult =
  | { success: true; redirectTo?: string }
  | { success: false; message?: string; fieldErrors?: Record<string, string> };
```

**The attempt.** `createSubmitAttempt(formId, values, createSubmission)`:

- `state: 'idle' | 'pending' | 'succeeded' | 'failed'`, starting at `idle`;
- `sealed = false`;
- `failure`, the error that `createSubmission` rejected with;
- `settled = Promise.resolve()`.

`submit` is a plain (non-`async`) function. `SubmitIgnoredError extends Error` (`name = 'SubmitIgnoredError'`) is exported:

```ts
function submit(values = request.values): Promise<void> {
  if (attempt.sealed || attempt.state !== 'idle') {              // second call, or after the hook settled: no POST
    const ignored = Promise.reject(logIgnored(new SubmitIgnoredError(formId))); // L2; returns the error
    ignored.catch(noop); return ignored;
  }
  attempt.state = 'pending';
  const posting = createSubmission(formId, values).then(
    () => { attempt.state = 'succeeded'; },
    (error) => { attempt.state = 'failed'; attempt.failure = error; throw error; });
  attempt.settled = posting.then(noop, noop);                      // also gives `posting` a handler
  return posting;
}
```

So the promise returned by `submit()` always has a handler, and an un-awaited `submit()` cannot raise an unhandled rejection. Promises that the hook derives from it, such as `submit().then(…)`, are the hook's own. Hook authors `await` or `return` `submit()`.

**Behaviour, top-down:**

1. `hook = deps.hook ?? (({ submit }) => submit())`. A plain form takes the same path.
2. If `deps.hook` exists, `identity = await deps.resolveIdentity()`. On a throw, log L1 and return `{ success: false, message: SUBMIT_FAILED_MESSAGE }`.
3. `try { outcome = await hook({ formId, values, caller: identity.caller, client: identity.client, submit: attempt.submit }) } catch (error) { thrown = error }`.
4. `attempt.sealed = true`, then `await attempt.settled`. A `submit()` that started before the seal is awaited.
5. `return settleSubmission(attempt, thrown, outcome)`.

**`settleSubmission`.** The first matching row wins. After step 4, `state` is `idle`, `succeeded`, or `failed`.

| # | Condition | Result | Logged |
|---|---|---|---|
| 1 | `succeeded` | `{ success: true, redirectTo }`. `redirectTo` is set only if the hook **returned** it | `thrown`, if any (L3) |
| 2 | `failed`, and `fieldErrorsOf(failure)` is non-empty | `{ success: false, fieldErrors }` | `thrown`, if any and `!== failure` (L3) |
| 3 | `failed`, otherwise | `{ success: false, message: SUBMIT_FAILED_MESSAGE }`, a 403 included | `failure` (L4, which carries a 403's detail for the admin); `thrown` as in row 2 |
| 4 | `idle`, and `thrown` is an `ActionError` | `{ success: false, message: thrown.message }` | nothing |
| 5 | anything else: `idle` with no throw, or with another throw | `{ success: false, message: SUBMIT_FAILED_MESSAGE }` | `thrown`, or "returned without calling `submit()`" (L5) |

- **Parity.** In rows 1–3, `thrown` never changes the result. A hook that swallows the `submit()` rejection and returns, one that rethrows it, and one that throws something else all get the same result. Only the log differs.
- `fieldErrorsOf(failure)` returns `parseSubmissionFieldErrors(failure.responseBody)` for a `WixApiError` (`utils/project-form-fields.ts:191-215`), and `{}` otherwise.
- An `ActionError` is recognised the way jay's `ActionRegistry` recognises it, `'code' in error && name === 'ActionError'`, so it survives duplicate module instances.

**Log points.** All are `console.error('[wix-forms] …', { formId, error: describeError(error) })`. `describeError` gives `name: message`, never the token or the values.

- **L1** identity resolution failed (`name: message` only, never cookies or tokens);
- **L2** `submit()` ignored (second call, or after the hook settled);
- **L3** hook threw after `submit()` was called;
- **L4** Wix rejected the submission without field violations;
- **L5** the hook failed before submitting;
- **L6** (client, browser console, `{ formId }` only) an unsafe `redirectTo` was dropped.

`submitForm` becomes a thin wrapper:

```ts
export const submitForm = makeJayAction('wixForms.submitForm')
  .withRequest()
  .withServices(WIX_FORMS_SERVICE)
  .withHandler((input: SubmitRequestInput, request, forms) => {
    const hooks = hasService(WIX_FORMS_SUBMIT_HOOKS) ? getService(WIX_FORMS_SUBMIT_HOOKS) : undefined;
    return runSubmission(input, {
      createSubmission: (id, values) => forms.createSubmission(id, values),
      resolveIdentity: async () => {
        const identity = resolveRequestIdentity(request.cookies);
        return { caller: await identity.caller, client: identity.client };
      },
      hook: selectHook(hooks, input.formId ?? ''),
    });
  });
```

`submit-form.jay-action` input is unchanged. The output is `success: boolean`, `redirectTo?: string`, `message?: string`, `fieldErrors?: object`.

### 4. Client (`components/wix-form.ts` submit handler)

```ts
event.preventDefault();
if (isSubmitting()) return;                        // a second click while one is in flight
setStatusMessage(''); setErrorByTarget({});
if (honeypotValue.trim()) { setIsSubmitted(true); return; }   // unchanged: no POST, no token read
const submissionValues = readFormValues();
const clientErrors = validateVisibleFields(carryForward.fields, submissionValues); // DL#39 fix: skips hidden
if (Object.keys(clientErrors).length) { /* set errors + invalid, return */ }
setIsSubmitting(true);                             // synchronous: before the first await
let result: SubmitFormResult;
try {                                              // only the transport: NETWORK_ERROR, TIMEOUT, unexpected server throw
  await ensureSessionFresh();                      // logs and continues on failure; never throws
  result = await submitForm({ formId: carryForward.formId, values: submissionValues });
} catch {
  setStatusMessage(SUBMIT_FAILED_MESSAGE); setIsSubmitting(false); return;
}
const redirectPath = presentSubmitResult(result);  // outside the try: a Wix success never shows "could not complete"
if (redirectPath) window.location.assign(redirectPath);  // the button stays disabled while the page navigates
else setIsSubmitting(false);
```

`presentSubmitResult(result)` returns the path to navigate to, or `undefined`:

- **On `success: false`**, it applies `presentSubmitRejection(result, carryForward.fields)` (Q20).
- **On success**, it calls `setIsSubmitted(true)` and returns `toSitePath(result.redirectTo)`. A dropped unsafe `redirectTo` is logged (L6).

`resetForm` also calls `setIsSubmitting(false)`, and a mount-time `pageshow` listener does the same when `event.persisted` is true. A hash-only redirect (no navigation) or a bfcache Back restore therefore never leaves the button disabled. `describeSubmitError` and the `WixApiError` / `parseSubmissionFieldErrors` imports are deleted.

**`components/submit-outcome.ts`** (client-safe) holds:

- `SUBMIT_FAILED_MESSAGE = 'We could not complete your request. Please try again.'`;
- `presentSubmitRejection`;
- `toSitePath`.

```ts
const PROBE_ORIGIN = 'https://site.invalid';
/** A same-site path ('/a?b#c') or undefined. Never throws. Idempotent. */
export function toSitePath(candidate: unknown): string | undefined {
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || /[\u0000-\u001F\u007F\\]/.test(candidate)) return undefined;
  try {
    const url = new URL(candidate, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return undefined;
    const path = url.pathname + url.search + url.hash;
    return path.startsWith('//') ? undefined : path;   // dot-segments can normalize to '//host'
  } catch { return undefined; }
}
```

Both checks were tested against Node's URL implementation: the control-character test catches `'/\t/evil.com'` (WHATWG parses it to `https://evil.com/`), and the `//` test catches dot segments such as `'/..//evil.com'` and `'/%2e%2e//evil.com'`, which keep the probe origin but normalize to `'//evil.com'`.

### 5. Remove the augmenter (migration)

- **Delete** `services/wix-forms-submission-augmenter.ts`, its 3 exports in `index.ts:14-18`, and the merge in `forms-actions.ts:22-30`.
- **Export** `WIX_FORMS_SUBMIT_HOOKS`, `SubmitIgnoredError`, `SubmitHook`, `SubmitHooks`, `SubmitHookInput`, `SubmitHookOutcome`, and `SubmitFormResult` (`VerifiedCaller` comes from wix-server-client).
- **Behaviour change (Q16):** a plain `Error` now shows the generic message.

```ts
// src/init.ts — before: a bare top-level registerService (this also shipped the augmenter to the browser)
// after:
export const init = makeJayInit().withServer(async () => {
  registerService(WIX_FORMS_SUBMIT_HOOKS, {
    [FORM_ID]: async ({ values, submit }) => { await submit({ ...values, source: 'web' }); },
  });
  return {};
});
```

### Diagram

```mermaid
sequenceDiagram
  participant B as Browser (wixForm)
  participant A as submitForm → runSubmission
  participant T as Wix token-info
  participant H as project hook
  participant W as Wix /forms/v4/submissions
  B->>B: validate visible fields; isSubmitting=true; ensureSessionFresh()
  B->>A: { formId, values } + wix_session cookie
  opt hooked form
    A->>T: POST { token } (from the cookie)
    T-->>A: caller | undefined (other status → logged generic result)
  end
  A->>H: { formId, values, caller, client, submit }
  H->>H: re-check slot (ActionError), write reservation
  H->>A: submit({...values, reference})
  A->>W: POST submission
  W-->>A: ok | 400 field violations | other failure
  A-->>H: resolves | rejects (hook compensates)
  H-->>A: { redirectTo } | throws
  A->>A: seal; await settled; settleSubmission (Wix outcome decides)
  A-->>B: SubmitFormResult
  B->>B: present result; toSitePath → location.assign
```

## Implementation Plan

**Phase 0: prerequisite, owned by DL#39.** Land DL#39's planned fix, including its skip-hidden-fields client validation (`validateVisibleFields`). It creates `submission/run-submission.ts`, its test file, `components/submit-outcome.ts`, and `{ success:false, fieldErrors }`. Phase 2 extends these. If this DL lands first, it subsumes the fix, and DL#39's Implementation Results records that.

**Phase 1: session (wix-server-client).** Gated on jay's request-cookie access for actions being available (synced into wix).

1. ⚠️ **MUST-VERIFY:** `token-info` fixtures (active member, active visitor, made-up JWT, non-JWT, expired) → `test/fixtures/token-info/*.json`; `INVALID_TOKEN_STATUSES` = the non-200s seen; if the member body lacks `clientId`, STOP. Measure access + refresh token sizes (Q22). Check whether a refresh rotates the refresh token, and the refresh-token lifetime. Confirm jay's same-origin check covers `.withRequest()` actions (Q25), and that wix-members' logout goes through `setTokens`.
2. Tests red first (V7, V13), then implement `session/`, the `storeTokens` hook, `ensureSessionFresh`, the `storage` listener, and the `plugin.yaml` action.

**Phase 2: hook and orchestration.**

1. MUST-VERIFY DL#39's open gate: in a live 400 body, `errorPath` equals the field `target`.
2. Write the tests red first (V1–V6, V9–V10). Flip DL#39's companion test ("a 403 is still thrown") to a **returned** `SUBMIT_FAILED_MESSAGE`, per V3.
3. Implement §Design 2, 3, 4, and 5.
4. Run `tsc`, `vitest`, and `npm run build` (ending in `validate-plugin`) for wix-forms. Run `tsc` and the tests for wix-bookings, which consumes `WIX_FORMS_SERVICE`, and for wix-server-client.

**Phase 3: agent-kit.** Replace `agent-kit/plugin/rich-forms.md` §4b with "Server-side submit hook". Cover:

- **Registration** inside `makeJayInit().withServer(...)`, never at the top level: `src/init.ts` is imported into the browser, and only `.withServer` is stripped. Today's §4b snippet registers at the top level, so fix it too.
- **Trust:** `caller` is trusted and `values` are not; `VISITOR` (self-mintable) vs `MEMBER`; Wix submissions are not a trust boundary. Server calls run as the site unless the hook uses `client`; identity comes from the server-set `wix_session` cookie. Include the wix-data contrast. **Docs are complete only when this guide section ships** (definition of done for this DL).
- **Rejecting:** `ActionError` for a user-facing rejection. A plain `Error` becomes the generic message.
- **`submit()`:** call it once, and `await` or `return` it. Compensate in `catch`. Once `submit()` was called, Wix's outcome decides the result.
- **`client`:** for Wix calls that must respect the caller's permissions; `undefined` without a session cookie.
- **Speed and idempotency:** a hook must finish well within the client's 30 s timeout. After a timeout the server may still succeed, and a user retry runs the hook again. So the example hook reuses an existing reservation for the same caller + slot and calls `submit()` again; the duplicate Wix submission is harmless display data (Q18).
- **`redirectTo`:** site paths only.
- **Hidden fields:** a required hidden field can be left empty on the client and filled by the hook.
- **The migration snippet**, with the behaviour change from Q16: a plain `Error` from the old augmenter now shows the generic message (throw `ActionError` to show text), a Wix 403 shows the generic message, and an `ActionError` thrown after `submit()` is logged, not shown.

Then run `npm run agent-kit` to regenerate the testbed copy, `examples/forms-members-testbed/agent-kit/plugin/rich-forms.md`. Its `diff` against the package copy must be empty.

**Phase 4: demo (`/demo-feature`)** in `examples/forms-members-testbed`.

1. Add `src/init.ts` with `export const init = makeJayInit().withServer(async () => { registerService(WIX_FORMS_SUBMIT_HOOKS, { [CONTACT_FORM_ID]: hook }); return {}; })`. The form id comes from `agent-kit/plugins-index.yaml`. Add `@jay-framework/stack-server-runtime` (for `registerService`) to the testbed's `dependencies`.
2. The hook behaves as follows:
   - for first name `paused`, it throws `ActionError('DEMO_BLOCKED', 'Submissions are paused (demo).')`;
   - for `wixreject`, it keeps an in-memory demo reservation and submits an invalid email, so Wix rejects it and the compensation runs (logged);
   - otherwise it returns `redirectTo: '/contact/confirmed?ref=<ref>&caller=<caller?.type ?? "NONE">'`.
   - Run on localhost (dev server), and show the `wix_session` cookie as httpOnly in devtools.
3. Add a fast-phase `src/pages/contact/confirmed/` page that renders `ref` and `caller`.
4. If the live form has no hidden reference field, V1 covers the hidden-field write. Adding a field to the live form is the site owner's step, so ask rather than work around it.

## Examples

✅ The driving use case (names are illustrative):

```ts
export const init = makeJayInit().withServer(async () => {
  registerService(WIX_FORMS_SUBMIT_HOOKS, {
    [REQUEST_VISIT_FORM_ID]: async ({ values, caller, submit }) => {
      if (caller?.type !== 'MEMBER')                                    // a VISITOR proves a session only
        throw new ActionError('SIGN_IN_REQUIRED', 'Please sign in again to request a visit.');
      const slot = parseSlot(values);                                   // re-validate (untrusted)
      const reservation = (await reservations.findOwn(caller.id, slot)) // a retry after a client timeout reuses it
        ?? (await reservations.createIfFree({ ownerId: caller.id, slot })); // source of truth; undefined if taken
      if (!reservation) throw new ActionError('SLOT_TAKEN', 'That time was just taken. Please pick another.');
      try {
        await submit({ ...values, [REFERENCE_FIELD]: reservation.reference }); // hidden, required field
      } catch (error) {
        await reservations.remove(reservation.id);                      // compensate
        throw error;                                                    // or swallow: same result
      }
      return { redirectTo: `/visit/confirmed?ref=${encodeURIComponent(reservation.reference)}` };
    },
  });
  return {};
});
```

❌ `registerService(WIX_FORMS_SUBMIT_HOOKS, …)` at the top level of `src/init.ts`. It ships the hook to the browser.
❌ `ownerId: values.memberId`. Use `caller.id`.
❌ Treating a `VISITOR` caller as a person or as spam protection.
❌ Trusting a Wix submission's hidden `reference` as proof that the hook ran.
❌ Calling `submit()` twice, or from a timer. The call is ignored and logged.
❌ `throw new Error('Slot taken')` for a user-facing problem. The user sees the generic message.
❌ `redirectTo: 'https://…'` or `'/..//evil.com'`. The client drops it and logs it.

## Trade-offs

- **(+)** Documented Wix APIs only; one path everywhere, localhost included; render-time code can use it too.
- **(+)** Lives once in wix-server-client; every wix-* plugin can reuse `client` / `caller`. No net new service marker.
- **(−)** Needs an upstream jay change (request-cookie access for actions).
- **(−)** Two token copies (localStorage + cookie). A failed sync leaves the server one change behind until the next sync; `ensureSessionFresh` narrows it for actions.
- **(−)** One extra `syncSession` round trip per token change.
- **(+)** One returned result type and one client result path. The outcome rule is a single sentence: once `submit()` was called, Wix decides.
- **(−)** A `VISITOR` caller is weak, and a lapsed member silently becomes a visitor (Q19).
- **(−)** A hooked submit adds one Wix round trip. A `token-info` outage fails the submit with the generic message.
- **(−)** The client times out after 30 s by default (`createActionCaller`), while the server may still succeed. A user retry then runs the hook and the Wix submission again. Mitigation: hooks finish well within 30 s, and a retry reuses the caller's reservation (agent-kit).
- **(−)** After a failed `submit()`, a hook's `ActionError` is logged, not shown: Wix's outcome wins.
- **(−)** Augmenter users migrate, and a plain `Error` (or a Wix 403) now shows the generic message. The detail goes to the server log.
- **(−)** "Transaction" means compensation by the consumer, not two-phase commit (Q17, Q18).
- **Deferred (additive):** **`SubmitRejection(fieldErrors)`**, a hook-raised per-field rejection, added when a consumer needs a field-anchored message (one new row before row 4, merging into `fieldErrors`); returning the Wix submission id from `submit()`.

## Verification Criteria

`submission/run-submission.ts`, written red first with fakes:

- [ ] **V1. Row 1, succeeded.**
  - With no hook, `createSubmission` gets the client values, the result is `{ success: true }`, and `resolveIdentity` is not called.
  - A hook's `submit(modified)` sends exactly `modified`, including a hook-set value for a required hidden field that the client sent empty. A returned `redirectTo` is passed through.
  - A throw after `submit()` resolved gives `{ success: true }` with no `redirectTo`, and is logged (L3).
- [ ] **V2. Row 2, Wix field violations.**
  - With no hook (DL#39's bug-repro), a field-violation `WixApiError` gives a **returned** `{ success: false, fieldErrors: { <target>: <message> } }`.
  - **Parity:** a hook that swallows the rejection, one that rethrows it, one that rethrows a wrapper, and one that throws `ActionError` after compensating all get the same result. Only the throws that are not the failure itself are logged.
- [ ] **V3. Row 3, other Wix failure.**
  - A 403 `WixApiError` and a `TypeError('fetch failed')` both give `SUBMIT_FAILED_MESSAGE`. Both are returned, not thrown, and both are logged (L4).
  - The same parity holds as in V2.
- [ ] **V4. Rows 4–5.**
  - An `ActionError` thrown before `submit()` returns its message, unlogged.
  - A plain `Error('db down')` before `submit()`, and a hook that returns without calling `submit()`, both return `SUBMIT_FAILED_MESSAGE` (not `'db down'`) and are logged (L5).
- [ ] **V5. Attempt lifecycle.**
  - `Promise.all([submit(), submit()])` makes 1 POST, and the result follows Wix's outcome. The second call rejects with a `SubmitIgnoredError` and is logged (L2).
  - A hook that calls `submit()` without awaiting it and returns gets a result that waits for the POST. When Wix rejects, no `unhandledRejection` process event fires.
  - A hook that schedules `submit()` on a timer and returns gets `SUBMIT_FAILED_MESSAGE`. When the timer fires: 0 POSTs, the late call is logged (L2), and no `unhandledRejection` fires.
- [ ] **V6. Hook selection and identity.**
  - `selectHook` returns `undefined` for `'constructor'`, `'toString'`, `'__proto__'`, and `'hasOwnProperty'`, and when there are no hooks.
  - `resolveIdentity` is called once for a hooked form, never for a plain one; the hook receives its `caller` and `client`.
  - When it throws, the result is `SUBMIT_FAILED_MESSAGE`, the hook does not run, and there is no POST. The single L1 entry contains no cookie or token value.

wix-server-client `session/` (injected fetch, fake `request`):

- [ ] **V7. `verifyAccessToken`.** The four checks against the Phase 1 fixtures plus `active:false`, a foreign `clientId`, `subjectType: 'APP'`, empty `subjectId`; empty token → no fetch; JSON POST, no `Authorization`, 5 s abort; invalid statuses → `undefined`; other non-200 → `WixApiError` without the token; nothing logged.
- [ ] **V13. Session.**
  - `syncSession({ tokens })` with a verified token sets `wix_session` with exactly `HttpOnly; SameSite=Lax; Path=/; Secure; Max-Age`; a failed check clears it; `{ clear: true }` clears it.
  - `resolveRequestIdentity`: no / garbled cookie → both `undefined`, no fetch; a valid cookie → `client` sends that access token as `Authorization`, and `caller` makes exactly one token-info call even when awaited twice.
  - Client: `storeTokens` calls `syncSession` only when the access token changed; `ensureSessionFresh` renews an expired token and awaits the sync.

Client pure helpers:

- [ ] **V9. `toSitePath`.**
  - It returns `undefined` for `'https://x'`, `'//x'`, `'x'`, `'/\\evil.com'`, `'\\/evil.com'`, `'/\t/evil.com'`, `'/\n/evil.com'`, `'/\u0000x'`, `'/..//evil.com'`, `'/.//evil.com'`, `'/a/..//evil.com'`, `'/%2e%2e//evil.com'`, and non-strings.
  - It returns `'/a?b=1#h'` for `'/a?b=1#h'`, and it is idempotent.
- [ ] **V10. `presentSubmitRejection`.**
  - A visible field's error goes to `errorByTarget` and `invalidByTarget`.
  - A hidden or unknown target's error goes into `statusMessage` as `label || target: message`, after `result.message`. So with no hook, Wix's 400 for an empty required hidden field shows as `Reference: <message>`.
  - With nothing else to show, the message is `SUBMIT_FAILED_MESSAGE`.

Build, demo, agent-kit:

- [ ] **V11. Gates.**
  - DL#39's `errorPath === target` gate is verified live.
  - No `WIX_FORMS_SUBMISSION_AUGMENTER` and no `describeSubmitError` remain in `lib/`.
  - `npm run build` passes `validate-plugin`.
  - No file under `components/` or `utils/`, and not `index.client.ts`, imports `submission/`, and wix-server-client's `index.client.ts` exports nothing from `session/` server modules.
  - wix-bookings compiles and its tests pass.
  - `jay` is untouched by this DL (its request-cookies capability is upstream).
  - No `console.*` in wix-server-client `session/` server modules.
- [ ] **V12. Demo and agent-kit.**
  - The browser demo (localhost) shows `caller=MEMBER` after login and `caller=VISITOR` after logout, the httpOnly `wix_session` cookie, no token in any request body, an `ActionError` message, compensation after a Wix rejection, the redirect, and a honeypot run with no POST.
  - It also shows a double click during token renewal (stored `expiresAt` set to the past first) that makes **1** `submitForm` request in the network log, and browser Back after the redirect (bfcache restore) showing an enabled submit button.
  - `rich-forms.md` documents the hook per Phase 3, and the testbed copy is identical to it.

## Scope Pre-mortem (what this will NOT handle)

- Availability reads, slot-picker UI, and reschedule flows: those are the consumer's.
- Double-booking (Q14), direct Wix submissions (Q18), and bot protection beyond DL#39's honeypot (Q19).
- Absolute or external `redirectTo`, and client-side routing for the redirect.
- Switching any plugin's default server calls (e.g. wix-data) to run as the member.
- Server-side token refresh and server-minted visitor tokens (Quick Start middleware).
- Deferred, each additive: `SubmitRejection`; identity caching; submitting the form itself with the caller's `client`; a wildcard or chained hook; the Wix submission id; a "received, but post-processing failed" outcome.

## Agent Feedback Loop (jay-feedback — definition of done)

- **Validation: none.** Hooks are TypeScript registered at runtime, not jay-html, so no `jay-stack validate` rule can inspect them. Misuse is logged at runtime instead (L2, L3, L5, L6).
- **agent-kit: yes.** `packages/wix-forms/agent-kit/plugin/rich-forms.md` §4b, plus the testbed copy (Phase 3). This includes the `withServer` registration rule, the 30 s timeout with idempotent writes, and the hidden-required-field pattern.
- **agent-kit (wix-server-client):** a short section on `resolveRequestIdentity` (`caller` vs `client`), the site-by-default rule, and calling `ensureSessionFresh()` before cookie-dependent actions.
- **Framework: none in this DL.** The upstream need (request-cookie access for actions) is jay's own design.

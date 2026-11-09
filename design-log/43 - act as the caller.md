# 43 - Act as the Caller

Status: Approved — Phases 1–3 implemented (2026-11-08); Phase 4 live checks pending

Builds on **DL#42** (session cookie `wix_session`, `resolveRequestIdentity`, the submit hook), **DL#41** (forms submit chain) and **DL#05** (wix-data, its 2026-10-26 auth note). Generic: any Jay project, no downstream site named. Uses only Wix's documented headless APIs and SDK.

## Decisions for the Implementer (TL;DR)

- **One identity mechanism.** Everything below gets the caller's client from wix-server-client's `resolveRequestIdentity(cookies).client` (DL#42).
- **The caller client has no OAuth strategy (DL#42 bug fix, lands first).** In `@wix/sdk`, `OAuthStrategy.getAuthHeaders` renews an expired access token and, with an empty refresh token or on a failed renewal, falls back to an **anonymous** grant (`OAuthStrategy.getAuthHeaders`; documented on [oauth-strategy](https://dev.wix.com/docs/sdk/core-modules/sdk/oauth-strategy): "Anonymous visitors: Handled automatically"). An expired member would silently become a new visitor: wrong submitter, wrong `_owner`, a hidden token call. A one-time expiry check cannot prevent it: a slow hook or a long action can cross expiry later. **Fix:** the caller client is the documented `createClient({ modules, headers: { Authorization: <access token value> } })` with **no `auth`** ([wix-client](https://dev.wix.com/docs/sdk/core-modules/sdk/wix-client), `headers`: "Headers for client calls. Can be used to set alternative authentication credentials such as authorization tokens used when creating a client to be used in a Wix App."). It also works for Wix Headless visitor/member tokens (verified live, V6); accepted by the owner (Q11). With no OAuth strategy (`client.auth` is the SDK's default, returning empty headers) the SDK has nothing to refresh with, so an anonymous grant is **impossible**; a token that lapses mid-request gets an honest Wix rejection. No custom strategy object (`{ auth: { getAuthHeaders } }`): undocumented for headless. `resolveRequestIdentity` also keeps a 60 s expiry check → `session: 'expired'`, no client. DL#42's `resolveRequestIdentity.client` changes the same way; its implementer records it in DL#42's Implementation Results. V6 PASSED. **No caller path sends an unauthenticated request:** `wixFetch` throws when it has no `authorization` option and the client's auth headers are empty, the caller client's `fetchWithAuth` (which drops `createClient`'s `headers`) throws, and so do `fetch` and `enableContext` (one supported surface; no identity leak). On the caller client only `client.use(module)`, `client.graphql` and `wixFetch(..., { authorization })` are supported (§Design 0).
- **Expired is not "no session".** Forms: expiry is checked **only when a post would be as the caller** — inside `submit` (`session === 'expired'`, or `expiresAt` within the 60 s margin) → the attempt fails with `SessionExpiredError` → `SUBMIT_SESSION_EXPIRED_MESSAGE`; never posts as the site or as a visitor. A hook that forces `{ as: 'site' }` still works with a stale cookie. For a form **without** a hook (default post = caller) the same check runs before posting. wix-data: `asCaller` throws `NoCallerSessionError` with `reason: 'expired'`. Fast render (plain navigation, no `ensureSessionFresh()`): renders the no-caller state; the interactive phase loads the caller's data.
- **Forms: the caller by default when there is a session.** `submit()` posts with the caller's `authorization` (via `wixFetch`) when the request has an active `wix_session` cookie, otherwise with the site client. Identity's `client` is resolved for **every** form (no network: a cookie decode and an `expiresAt` check); `caller` stays lazy and hook-only.
- **Forms: force the site per call.** `submit(values?, { as: 'site' })`. A form without a hook that must post as the site registers a one-line hook. No new config surface.
- **Forms: no silent retry.** A caller-token submission that Wix refuses is **not** retried with the site client. Until V2 records a not-allowed status it returns `{ success: false, message: SUBMIT_FAILED_MESSAGE }` and logs L6 (status only); `SUBMIT_NOT_ALLOWED_MESSAGE` applies only to a status V2 records. The 5-row outcome table and call-once semantics are unchanged; this only adds message choices inside the existing `failed` row (`SessionExpiredError` first).
- **wix-data: opt-in, never default.** `WixDataService.asCaller(identity)` returns an `ItemsClient` bound to `identity.client`. Without a session it **throws** `NoCallerSessionError`. It never falls back to the site. The default `WixDataService.items` stays site.
- **wix-data: no existing action changes.** `queryItems`, `getItemBySlug`, `getCategories` stay site-scoped. Two of them are `.withCaching()`, and jay's `.withRequest()`/`.withCaching()` guard refuses the combination, so caller reads cannot be shared-cached.
- **Fast render: yes, through `props.cookies`.** Slow render: never (no cookies, output is shared).
- **Permission errors → `ActionError('FORBIDDEN', …)`** through one helper, `isPermissionDenied(error)`, in wix-server-client next to `WixApiError`.
- **jay-feedback:** three agent-kit guides (wix-forms `rich-forms.md`, the wix-data guide, wix-server-client `wix-request-session.md`). No validation (§jay-feedback).

---

## Background

DL#42 added a server-set, httpOnly `wix_session` cookie that mirrors the browser's OAuth tokens. `resolveRequestIdentity(cookies)` (`packages/wix-server-client/lib/session/request-identity.ts:18-35`) returns:

- `client`: today `createClient({ auth: OAuthStrategy({ clientId, tokens }) })` (:33); §Design 0 replaces it with a headers-only client;
- `caller`: lazy `token-info` verification (:29-32).

DL#42 deliberately kept the site client for `submit()` (DL#42 Q13) and switched no plugin default (DL#42 §Background table).

**Current code paths.**

- Forms: `submitForm` (`packages/wix-forms/lib/actions/forms-actions.ts:17-30`) resolves identity only inside `resolveIdentity` (:24-27), which `runSubmission` calls only for a hooked form (`submission/run-submission.ts:43-50`). `submit()` always calls `deps.createSubmission(formId, values)` (:102), which is `forms.createSubmission` (`services/wix-forms-service.ts:74-78`) → `createFormSubmission(wixClient, …)` (`wix-apis/create-submission.ts:17-31`) with the **site** client.
- wix-data: `init.ts:30-36` builds `WixDataService` from `WIX_CLIENT_SERVICE` (site). `wix-data-service.ts:68-82` keeps the `items`/`collections` clients as **module-level singletons**, so a caller client must never go through `getItemsClient`. Browser: `WIX_DATA_CONTEXT` (`contexts/wix-data-context.ts:37-49`) already runs as the visitor/member.

### Observed evidence (2026-10-28, test site)

| Call                         | Token                      | Result                               |
| ---------------------------- | -------------------------- | ------------------------------------ |
| `POST /forms/v4/submissions` | visitor OAuth access token | accepted; `submitter: { visitorId }` |
| `POST /forms/v4/submissions` | member OAuth access token  | accepted; `submitter: { memberId }`  |

The member probe sent the member's access token as `Authorization` and got `submitter: { memberId }`, which proves the header alone carries the identity for forms. The calls were made from the browser; the server-side request sends the same `Authorization` header, so it is expected to be equivalent (confirmed by V6). `/forms/v4/submissions` is an alias of the documented `/form-submission-service/v4/submissions`, observed working; **this work switches `create-submission.ts` to the documented path.** Documented endpoint: [Create Submission](https://dev.wix.com/docs/rest/crm/forms/form-submissions/create-submission) / SDK [`submissions.createSubmission`](https://dev.wix.com/docs/sdk/backend-modules/forms/submissions/create-submission).

## Problem

1. **Submissions are attributed to the site, not the person.** With the site client, Wix cannot record which visitor or member submitted. Member-facing features (a member's own submissions, contact linking) lose the link.
2. **Server-side data code runs elevated with no opt-out.** A server action that writes a member's record gets no `_owner` = member, and Wix does not enforce the collection's permissions. Code must re-implement access rules by hand (DL#05 note).

## Prior Art / Adjacent Mechanisms

- **DL#42 `resolveRequestIdentity`.** **Solves** "get a caller client". Reused, with the §Design 0 fix (expiry check, `session` state).
- **DL#42 `SubmitHook` / `runSubmission`.** **Extended.** `submit` gains an option; `SubmitDeps.createSubmission` gains an `authorization` argument.
- **Browser `WIX_DATA_CONTEXT`.** **Partially solves** (caller-scoped reads in the interactive phase), but not server actions, fast render, or writes that must run on the server after a server check.
- **jay's `.withRequest()`/`.withCaching()` guard.** **Solves** shared caching for actions: an action that reads cookies cannot be cached.
- **jay fast render cookies** (the public `RequestCookies` props). **Solves** cookie access in fast render.
- **jay's detached action request** (an action handler called outside an HTTP request): a handler called directly (e.g. from render) sees **empty** cookies, so `asCaller` there throws rather than silently going site.
- **`WixApiError`** (wix-server-client `wix-fetch.ts`): carries `status`. **Reused** for forms' 401/403 detection.

### Null hypothesis per new surface

| New surface                               | Existing primitive                          | Why it doesn't suffice                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit(values, { as: 'site' })`          | none (site was the only mode)               | Once the default flips, a form whose Wix permissions reject visitors needs a way back. A per-call option keeps it in the hook, where the decision is made. A per-form YAML flag was rejected: a second config surface for a rare case. |
| `SUBMIT_NOT_ALLOWED_MESSAGE`              | `SUBMIT_FAILED_MESSAGE`                     | A permission refusal is actionable ("sign in"); the generic message is not. One constant, same result shape.                                                                                                                           |
| `WixDataService.asCaller(identity)`       | hook `client` + `client.use(items)` by hand | Works, but every call site repeats it, and nothing stops `getItemsClient`'s singleton from being reused. One method that **throws** without a session is the guard.                                                                    |
| `isPermissionDenied(error)`               | inline `status === 403`                     | Two error shapes exist (`WixApiError` from `wixFetch`; SDK errors from `items.*`). One helper owns the mapping.                                                                                                                        |
| `SUBMIT_SESSION_EXPIRED_MESSAGE`          | `SUBMIT_NOT_ALLOWED_MESSAGE`                | "Sign in" is wrong advice to a signed-in member whose token expired; refreshing the page re-runs the browser's token renewal and `syncSession`.                                                                                        |
| `session: 'expired'` on `RequestIdentity` | `client: undefined`                         | Indistinguishable from "no session", which falls back to the site.                                                                                                                                                                     |
| `NoCallerSessionError` (with `reason`)    | return `undefined`                          | Callers would `?? siteItems`, which is the silent fallback the owner forbids.                                                                                                                                                          |

## Questions and Answers

**Q1 — Which client does `submit()` use?**
A: `options?.as === 'site'` → site; else `session === 'active'` → the caller's `authorization`; `'expired'` → `SessionExpiredError` (no post); `'none'` → site. **Answered.**

**Q2 — Is identity resolved for a form with no hook?**
A: Yes, `client` only (synchronous; `resolveRequestIdentity` does no fetch unless `caller` is read, `request-identity.ts:29-32`). The headers client has no OAuth strategy (its `client.auth` is the SDK's built-in default, whose `getAuthHeaders` returns `{ headers: {} }`: no refresh path), so neither building it nor calling through it ever hits `/oauth2/token`. The hook-only `caller` read is unchanged, so no new `token-info` calls. **Answered.**

**Q3 — How does a form without a hook force the site?**
A: Register a hook: `{ [formId]: ({ submit }) => submit(undefined, { as: 'site' }) }`. It posts as the site even when the cookie has expired: expiry is checked only for caller posts. **Answered.**

**Q4 — What happens when Wix refuses the caller's submission?**
A: Create Submission documents 400 `SUBMISSION_VALIDATION`, 404, 428 `SITE_IS_A_TEMPLATE`, 428 `INVALID_CAPTCHA` and 503; 401/403 are **not** documented. **Decided fallback: no forms status maps to "not allowed" until V2 records one** (forms-side V2 and V5 are hard Phase 0 prerequisites for the forms `isPermissionDenied` tests). Until then every caller refusal takes the generic path (L6 log `{ formId, status, as: 'caller' }`, `SUBMIT_FAILED_MESSAGE`), **with no retry as the site** — retrying would submit something Wix just refused, under the site's name. Once V2 records a status, that status → `SUBMIT_NOT_ALLOWED_MESSAGE`. **428 `SITE_IS_A_TEMPLATE`** → generic L4 for caller and site posts. **428 `INVALID_CAPTCHA`** → `SUBMIT_FAILED_MESSAGE`: with L6 on a caller post, on the generic L4 path on a site post; the `{ as: 'site' }` guidance applies only if V5 shows a site post passes captcha. A 400 with field violations keeps DL#41's `fieldErrors` path. The branch reads the attempt's own failure, so it applies whether the hook swallowed or rethrew the submit error (`thrown === attempt.failure`, `run-submission.ts:126`, the comparison; L3 is logged at :127). A refusal of a **site** POST is unchanged (L4). **Answered; the forms not-allowed status is gated on V2.**

**Q5 — Expired access token in the cookie?**
A: `resolveRequestIdentity` returns `session: 'expired'` (expiresAt < now + 60 s) and no client (§Design 0). A token that lapses later, mid-request, is sent as-is by the headers client and rejected by Wix (status per V2/V3) — never renewed, never anonymous. Forms: `submit` checks expiry only when the post would be as the caller (`'expired'`, or `expiresAt` within the margin) → `SessionExpiredError` → `{ success: false, message: SUBMIT_SESSION_EXPIRED_MESSAGE }` = `'Your session expired. Please refresh the page and try again.'`, never posts as the site or as a visitor. `ensureSessionFresh()` before `submitForm` (DL#42 Q4) makes this rare. Fast render on plain navigation has no `ensureSessionFresh()`: `asCaller` throws `NoCallerSessionError('expired')` → the page renders its no-caller state; the interactive phase, which owns fresh tokens, loads the caller's data via `WIX_DATA_CONTEXT`. **Answered.**

**Q5b — `resolveClient()` throws because server init did not run** (`siteOAuthClientId`, `site-oauth-client-id.ts:6-10`)?
A: It no longer can: `siteOAuthClientId()` moves into the lazy `caller` getter (§Design 0), so building `client`/`authorization` never reads it. A hooked form that reads `caller` without server init gets the existing L1 path (`resolveIdentity` throws → L1 + `SUBMIT_FAILED_MESSAGE`). `resolveClient` stays in a try anyway; never a site fallback. **Answered.**

**Q6 — wix-data: how does a `.withRequest()` action get the caller client?**
A: `wixData.asCaller(resolveRequestIdentity(request.cookies))`, which returns the caller-scoped `ItemsClient` (then `insert` / `query` on it). **Answered.**

**Q7 — Should any existing wix-data action default to caller?**
A: **No.** All three are reads of public, configured collections; two are cached. Flipping them would make them per-user and uncacheable, and would change results for existing pages. **Answered.**

**Q8 — Fast render?**
A: Yes: `resolveRequestIdentity(props.cookies)`. The render sets `Cache-Control: private` through the `responseHeaders` option of its phase output; ⚠️ MUST-VERIFY V4 that it reaches the response and that nothing shared caches it. Slow render: never; it has no cookies and its output is shared. **Answered, gated.**

**Q9 — Do collections/schema calls run as the caller?**
A: No. `asCaller` exposes `items` only. Schemas and `getProcessedSchema` caches stay site-scoped and shared. **Answered.**

**Q10 — Does `_owner` become the member?**
A: Expected yes, per Wix's documented behaviour that `_owner` is the ID of the user who created the item ([Data Item object](https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/data-item-object); [Data Collection object, permissions](https://dev.wix.com/docs/api-reference/business-solutions/cms/collection-management/data-collections/data-collection-object); [enforcement](https://dev.wix.com/docs/api-reference/business-solutions/cms/collection-management/data-collections/introduction#permissions)). For a **visitor** token, what `_owner` becomes is gated by MUST-VERIFY V1. **Answered, gated.**

**Q11 — Owner acceptance of the `headers` option for headless tokens?**
A: **ACCEPTED by the owner (2026-10-28).** Documentation: [Wix Client — `createClient` `headers`](https://dev.wix.com/docs/sdk/core-modules/sdk/wix-client) ("Headers for client calls. Can be used to set alternative authentication credentials such as authorization tokens used when creating a client to be used in a Wix App."). The docs frame it for Wix Apps; it **also works for Wix Headless**: verified live (V6, 2026-10-28) with headless visitor and member OAuth tokens — member insert set `_owner` to the member, member query returned only own items, visitor was refused (`WDE0027`), and no `/oauth2/token` call was made.

## Design

### 0. wix-server-client: a headers-only caller client (DL#42 bug fix, first)

```ts
export interface RequestIdentity {
  readonly caller: Promise<VerifiedCaller | undefined>;
  /** Headers-only client, no OAuth strategy (default `client.auth`, no refresh path); undefined when session !== 'active'. */
  client: WixClient | undefined;
  session: 'none' | 'active' | 'expired';
  /** The access-token value, for wixFetch's `authorization` option; set when session === 'active'. Never logged. */
  authorization?: string;
  /** Access-token expiry in epoch seconds; for the pre-post re-check. Set for 'active' and 'expired'; undefined for 'none'. */
  expiresAt?: number;
}
export const EXPIRY_MARGIN_SECONDS = 60;
/** The one expiry rule; wix-forms imports it. */
export function isExpiringSoon(expiresAt: number | undefined, nowSeconds?: number): boolean;
```

- `decodeSessionCookie`: a missing or non-finite `accessToken.expiresAt` → `undefined` → session `'none'`.
- `resolveRequestIdentity`: no/invalid cookie → `'none'`. `isExpiringSoon(expiresAt)` → `'expired'`, `client: undefined`, `caller` resolves `undefined` with no fetch. Otherwise `'active'`, `client = createClient({ modules: {}, headers: { Authorization: tokens.accessToken.value } })` ([wix-client](https://dev.wix.com/docs/sdk/core-modules/sdk/wix-client)); the refresh token is never given to the SDK. Consumers add modules with `WixClient.use(...)` (`asCaller`); REST calls go through `wixFetch` with `authorization`.
- **`wixFetch` options (additive signature change; existing callers unchanged):**
  ```ts
  export interface WixFetchOptions {
    method?: string;
    body?: any;
    authorization?: string;
  }
  ```
- **`wixFetch` with a headers-only client.** Module calls through `WixClient.use(...)` send the `createClient` `headers`, so `Authorization` is sent and `asCaller` works (V6). But a headers-only client's `client.auth` is the SDK's default strategy, whose `getAuthHeaders()` returns `{ headers: {} }`, so `wixFetch(identity.client, …)` (`packages/wix-server-client/lib/wix-fetch.ts:30`) would silently send an **unauthenticated** request. **Fix (chosen): `wixFetch` takes an `authorization` option, and throws `Error('wixFetch: no Authorization for <path>; pass the caller's authorization or use the site client')` whenever it would send no `Authorization`** (no option and empty auth headers). Chosen over a caller-bound fetch on the identity because the guard then protects _every_ `wixFetch` call, not only those that remember to use the bound fetch, and the site path is unchanged. `createFormSubmission` only forwards `authorization`.
- **Caller client surface.** `WixClient.fetchWithAuth` builds headers from `requestInit.headers` + auth headers only, never `createClient`'s `headers`; on this client the auth headers are empty, so it would send an **unauthenticated** request (new vs DL#42, where `client` was OAuthStrategy). **`graphql` is supported** (it sends the headers, like `use`). **`fetch` is stubbed** even though it would send the headers: it is deprecated, and the caller client keeps one supported surface. **Supported:** `client.use(module)`, `client.graphql` and `wixFetch(..., { authorization })`. **Stubbed (throw `Error("Not supported on the caller client: use client.use(module), client.graphql or wixFetch(..., { authorization })")`):** `fetchWithAuth` (unauthenticated), `fetch` (keeps one supported surface; deprecated), and `enableContext` (`enableContext('global')` would register the caller as the global context and leak identity beyond the request). Stubs are **assigned on the returned client** (`client.fetchWithAuth = stub; client.fetch = stub; client.enableContext = stub`), never by spreading into a copy, which would freeze the `auth` getter and break `this`.
- `siteOAuthClientId()` is read inside the lazy `caller` getter only, not when building `client`.
- `caller` verification (`verifyAccessToken`) already posts the token to `token-info` directly, with no strategy; unchanged.
- DL#42's `client` changes the same way; recorded in DL#42's Implementation Results by its implementer.

### 1. wix-server-client: `isPermissionDenied`

```ts
/** True when Wix refused the call for authentication or permissions (V2). */
export function isPermissionDenied(error: unknown): boolean;
```

`WixApiError` → **no status until forms-side V2 records one** (decided fallback, Q4). An SDK/data error → exactly code `WDE0027` (V2, measured), read from `error.details.applicationError.code`; the exact thrown error shape is captured as a fixture in V2 (if it differs, `isPermissionDenied` reads the recorded field). `WDE0117` (invalid token, "MetaSite not found") is **not** permission-denied: it maps to the generic failure. Until then `isPermissionDenied` is false for every forms status; a restricted form's refusal gets the generic message, and the guide says to use `{ as: 'site' }`. Exported from the server `index.ts`.

### 2. wix-forms

```ts
export interface SubmitOptions { /** Default: the caller when a session exists, else the site. */ as?: 'site' }
submit(values?: Record<string, FieldValue>, options?: SubmitOptions): Promise<void>;

export interface CallerSession { session: 'none' | 'active' | 'expired'; authorization?: string; expiresAt?: number }
export interface SubmitDeps {
  createSubmission(formId: string, values: Values, authorization?: string): Promise<void>; // undefined = site client
  resolveIdentity(): Promise<{ caller: VerifiedCaller | undefined; client: WixClient | undefined }>; // unchanged
  resolveClient(): CallerSession; // new, synchronous, every form (forms posts via authorization; the hook's client comes from resolveIdentity)
  hook?: SubmitHook;
}
function createSubmitAttempt(formId: string, values: Values, createSubmission: SubmitDeps['createSubmission'], callerSession: CallerSession): SubmitAttempt;
```

- Hook JSDoc on `SubmitHookInput.client`: "Caller-scoped. Supported: `client.use(module)`, `client.graphql` and `wixFetch(..., { authorization })` only; `fetchWithAuth`/`fetch`/`enableContext` throw."
- The expiry check uses wix-server-client's `isExpiringSoon(expiresAt)`; no second margin in wix-forms. The expired path sets `state = 'failed'` without posting and leaves `attempt.settled` resolved.

```ts
interface SubmitAttempt {
  state: 'idle' | 'pending' | 'succeeded' | 'failed';
  /** Set synchronously with state = 'pending'. 'site' when forced or when there is no session. */
  postedAs?: 'caller' | 'site';
  sealed: boolean;
  failure?: unknown;
  settled: Promise<void>;
  submit(values?: Values, options?: SubmitOptions): Promise<void>;
}
```

- `runSubmission`: `const { session, authorization: callerAuthorization, expiresAt } = deps.resolveClient()` inside a try (throw → L1 + `SUBMIT_FAILED_MESSAGE`). `session === 'active'` without `authorization` → L1 + `SUBMIT_FAILED_MESSAGE` (never a silent site post). No pre-hook expired exit: for a form with no hook, the default `submit()` below handles it. In `submit`, in the same synchronous block that sets `state = 'pending'`: `const asCaller = options?.as !== 'site' && session !== 'none'`. If `asCaller` and (`session === 'expired'` or `isExpiringSoon(expiresAt)`): `state = 'failed'`, `failure = new SessionExpiredError(formId)`, `postedAs = 'caller'`, no post; returns a rejection with that error (handler attached). Otherwise `const authorization = asCaller ? callerAuthorization : undefined; attempt.postedAs = authorization ? 'caller' : 'site';` then `createSubmission(formId, values, authorization)`.
- `settleSubmission` `failed` row, reading `attempt.failure` (so it holds whether the hook swallowed or rethrew, `run-submission.ts:126`): **`SessionExpiredError` first** → `SUBMIT_SESSION_EXPIRED_MESSAGE` (the attempt is consumed: a second `submit()` is ignored with L2 / `SubmitIgnoredError`); then field errors; then `postedAs === 'caller' && isPermissionDenied(failure)` (pending V2; false for every forms status until then) → L6 + `SUBMIT_NOT_ALLOWED_MESSAGE`; then any other caller refusal (including 428 `INVALID_CAPTCHA`) → L6 + `SUBMIT_FAILED_MESSAGE`; then any site refusal → L4 + `SUBMIT_FAILED_MESSAGE` (428s included).
- **L6 reuses `logFailure`** (`run-submission.ts:165-169`) with `what = 'Wix refused the caller's submission'` and the `WixApiError` (its `name: message` carries the status); no new helper. `logFailure` never logs tokens, cookies or values.
- `SUBMIT_NOT_ALLOWED_MESSAGE = 'Please sign in to submit this form.'`; `SUBMIT_SESSION_EXPIRED_MESSAGE = 'Your session expired. Please refresh the page and try again.'`
- **Client: no change.** `components/submit-outcome.ts:32-46` already renders `result.message`.
- `forms-actions.ts:22-29`: one `const identity = resolveRequestIdentity(request.cookies)` per request, shared: `resolveClient: () => ({ session: identity.session, authorization: identity.authorization, expiresAt: identity.expiresAt })` and `resolveIdentity` reads the same `identity`.
- `WixFormsService.createSubmission(formId, values, authorization?)` → `createFormSubmission(wixClient, formId, values, authorization)` → `wixFetch(wixClient, path, { method, body, authorization })`. With `authorization` the caller's token is the only credential; without it, the site client's auth as today. (`SubmitDeps.createSubmission` passes the caller's `authorization` instead of a client.) A direct call with no `authorization` is unchanged and posts as the site.
- `SessionExpiredError` (exported from wix-forms, like `SubmitIgnoredError`) is what `submit()` rejects with on expiry.
- Both messages in `components/submit-outcome.ts` (client-safe).
- `create-submission.ts` posts to the documented `/form-submission-service/v4/submissions`.

### 3. wix-data

```ts
export class NoCallerSessionError extends Error { constructor(readonly reason: 'none' | 'expired') }
// WixDataService
asCaller(identity: RequestIdentity): ItemsClient; // throws NoCallerSessionError(identity.session) unless 'active'
```

- Returns `ItemsClient` directly (no wrapper: only `items` is caller-scoped, Q9). Built per call on the §Design 0 headers client: `identity.client.use(items)`. **Never** via `getItemsClient` (module singleton, `wix-data-service.ts:68-72`).
- Error mapping, in the consumer's handler: `if (isPermissionDenied(e)) throw new ActionError('FORBIDDEN', '…')`. Documented in the guide; wix-data's own actions do not use `asCaller`.

## Implementation Plan

**Phase 0 — MUST-VERIFY (live, test site).** V6 and V1 done (PASSED); remaining: V2 (forms side) and V5 — **hard prerequisites for the forms `isPermissionDenied` tests** — then V3, V4; record answers in Implementation Results. V2's shapes become fixtures for Phase 1.

**Phase 1 — wix-server-client.** Red tests, then §Design 0 (DL#42 fix, first) and `isPermissionDenied`. The server `index.ts` exports `isExpiringSoon`, `EXPIRY_MARGIN_SECONDS`, `WixFetchOptions` and `isPermissionDenied` (wix-forms imports the first two). Update DL#42's session tests (V13 expectations) for the new identity shape (`session`, `authorization`, `expiresAt`, headers-only client). Append to DL#42's Implementation Results: "OAuthStrategy caller client replaced by DL #43 §Design 0".

**Phase 2 — wix-forms.** Red tests in `run-submission.test.ts`, then §Design 2. Update `create-submission`, the service, the action.

**Phase 3 — wix-data.** Red tests, then `asCaller` + `NoCallerSessionError`.

**Phase 4 — agent-kit guides** (wix-forms `rich-forms.md`; new wix-data `caller-scoped-data.md`; wix-server-client `packages/wix-server-client/agent-kit/plugin/wix-request-session.md` and its synced testbed copy, `examples/forms-members-testbed/agent-kit/plugin/wix-request-session.md`), **DL#05/#42 notes** (append-only Implementation Results / Notes), demo (`/demo-feature`): a visitor submits a form, the submission shows `submitter.visitorId`; log in, submit, `submitter.memberId`.

**Final step.** When the status moves to Implemented, update `readme.md`'s cross-cutting line: forms are caller-by-default when a session exists; wix-data stays site by default with opt-in `asCaller`.

### Completion criteria: may start vs done

- **May start (after owner approval):** Phases 1–3.
- **Done (Phase 4: demo, development-complete):** requires V2 (forms side), V3, V4 (**hard gate**) and V5 recorded in Implementation Results. Captcha `{ as: 'site' }` guidance is not published before V5; fast-render caller examples are not supported before V4.

### Red-first tests

wix-server-client

- "an expired member token never triggers the anonymous grant and never posts as a visitor" — cookie with `expiresAt` = now + 30 s; `session === 'expired'`, `client` undefined; the mocked `/oauth2/token` is never called (in particular never with `grantType: 'anonymous'`).
- "a token that lapses mid-request never reaches /oauth2/token" — resolve an active identity; advance fake time by more than 61 s; call `identity.client.use(items).query(...)` with global `fetch` mocked: the outgoing `Authorization` equals the stored token, and no request goes to `/oauth2/token`.
- "`identity.client.fetchWithAuth`, `fetch` and `enableContext` throw and never send a request or register a context" — the error text names the supported paths; mocked `fetch` never called.
- "`client.use(items)` still works after stubbing" — sends `Authorization` equal to the token.
- "`client.graphql` sends `Authorization`" — equal to the stored token.
- "`isExpiringSoon` is the single margin": true at `now + 59`, false at `now + 61`.
- "the caller client has no OAuth strategy" — built with `headers.Authorization` only, no `auth` option; `client.auth.getAuthHeaders()` returns `{ headers: {} }`.
- "a cookie with a missing or non-finite expiresAt is session 'none'".
- "an active session gives a client with headers.Authorization, authorization equal to the token, and expiresAt set".
- "building an identity does not read siteOAuthClientId; reading caller does".
- "`wixFetch` with the authorization option sends exactly that header and does not mix in the site client's auth headers" — the site client's `getAuthHeaders` is never called.
- `isPermissionDenied` true for the V2 `WDE0027` SDK error fixture; false for `WDE0117`, 400, 428, 500, network.
- _pending V2:_ `WixApiError(401)` / `WixApiError(403)` rows — not specified until forms-side V2 records the status.
- "`wixFetch` on a headers-only client without `authorization` throws and never sends an unauthenticated request" — mocked `fetch` never called.

wix-forms (`runSubmission`)

- "posts with the caller client when the request has a session" — `createSubmission` called with the caller's `authorization`.
- "posts with the site client when there is no session" — called with `undefined`.
- "posts as the site when the hook passes `{ as: 'site' }`" — with a session present.
- "a form without a hook and an expired session returns SUBMIT_SESSION_EXPIRED_MESSAGE and never posts" — `createSubmission` never called.
- "`submit()` on an expired session rejects with SessionExpiredError, consumes the attempt, and a second `submit()` is ignored (L2)" → `SUBMIT_SESSION_EXPIRED_MESSAGE`.
- "{ as: 'site' } with an expired cookie still posts as the site".
- "an active session without authorization logs L1, returns SUBMIT_FAILED_MESSAGE, never posts".
- "resolveClient throwing (no server init) returns SUBMIT_FAILED_MESSAGE and never posts as the site".
- "the caller-refusal branch applies when the hook rethrows the submit error".
- "submit re-checks expiry: a token that lapsed during the hook is not posted" → `SUBMIT_SESSION_EXPIRED_MESSAGE`.
- "428 SITE_IS_A_TEMPLATE takes the generic path for caller and site posts".
- "caller submission sends the caller's access token as Authorization and never calls client.auth" — `createSubmission(formId, values, authorization)` → `wixFetch` with `authorization`: the request header equals the token; `client.auth.getAuthHeaders` is never called.
- regression: "`WixFormsService.createSubmission(formId, values)` with no `authorization` posts with the site client".
- "a caller 428 INVALID_CAPTCHA returns SUBMIT_FAILED_MESSAGE, no retry".
- "does not retry as the site when Wix refuses the caller" — `createSubmission` called exactly once; result `{ success: false, message: SUBMIT_FAILED_MESSAGE }`; L6 logged.
- _pending V2:_ "a caller refusal with the V2-recorded status returns SUBMIT_NOT_ALLOWED_MESSAGE".
- "a 403 on a site post keeps the generic message" — `SUBMIT_FAILED_MESSAGE`.
- "field violations on a caller post still return fieldErrors".
- "no token appears in the logs" — a caller refusal (any non-2xx); the captured `console.error` output contains neither the access nor the refresh token value.
- "`postedAs` is 'site' when forced with `{ as: 'site' }`" and "`postedAs` is 'site' with no session".
- `submit-outcome` test: `SUBMIT_NOT_ALLOWED_MESSAGE` and `SUBMIT_SESSION_EXPIRED_MESSAGE` results render their exact copy as `statusMessage`.
- "a form without a hook does not call token-info" — `fetchImpl` never called.
- Existing 5-row and call-once tests unchanged and green.

wix-data

- "`asCaller` throws NoCallerSessionError without a session".
- "`asCaller` uses the caller client, not the site singleton" — `identity.client.use` called; `service.items` unchanged.
- "`asCaller` with an expired session throws NoCallerSessionError('expired') and never triggers the anonymous grant".
- "a detached handler call (empty cookies) → NoCallerSessionError('none')".
- "`asCaller` works without server init" — `siteOAuthClientId` not read.

## Examples

```ts
// A form whose Wix permissions reject visitors: keep posting as the site (works even with an expired cookie).
registerService(WIX_FORMS_SUBMIT_HOOKS, {
  'contact-us': ({ submit }) => submit(undefined, { as: 'site' }),
});
```

```ts
// A member saves a favourite; Wix sets _owner and enforces the collection's permissions.
export const saveFavourite = makeJayAction('app.saveFavourite')
  .withRequest()
  .withServices(WIX_DATA_SERVICE_MARKER)
  .withHandler(async (input: { itemId: string }, request, wixData) => {
    try {
      const items = wixData.asCaller(resolveRequestIdentity(request.cookies));
      return await items.insert('Favourites', { itemId: input.itemId });
    } catch (error) {
      if (error instanceof NoCallerSessionError || isPermissionDenied(error))
        throw new ActionError('FORBIDDEN', 'Sign in to save favourites.');
      throw error;
    }
  });
```

```ts
// Fast render: the member's own items.
async function renderFastChanging(props, carry, wixData) {
  try {
    const items = wixData.asCaller(resolveRequestIdentity(props.cookies));
    // ... read the caller's items
    return phaseOutput(viewState, carry, { responseHeaders: { 'Cache-Control': 'private' } });
  } catch (error) {
    if (error instanceof NoCallerSessionError || isPermissionDenied(error)) {
      // missing/expired session or refused: render the signed-out state; the interactive phase loads the caller's data
      return phaseOutput(signedOutViewState, carry, {
        responseHeaders: { 'Cache-Control': 'private' },
      });
    } else throw error;
  }
}
```

## Trade-offs

- **Forms default flips (caller when a session exists).** Gain: correct attribution, Wix's own permissions. Cost: a form whose Wix settings reject visitors now fails where it succeeded as the site; mitigated by `{ as: 'site' }` (which also ignores an expired cookie) and no silent retry; until V2 the refusal message is generic.
- **wix-data stays site by default.** Safer; caller mode is a conscious choice per call site.
- **No per-form YAML flag.** One hook line instead of a second config surface.
- **Caller `items` only.** Schemas stay shared and cached.

## Verification Criteria

- All red-first tests above go green; existing wix-forms and wix-data suites green.
- Demo video: visitor submission → `submitter.visitorId`; member submission → `submitter.memberId` (server-side path).
- A `asCaller` insert by a member has `_owner` = that member's id (V1).
- Gated on V4: a cookie-dependent fast-render response carries `Cache-Control: private` on both the caller and the signed-out branch.
- A caller insert into an admin-only collection returns `ActionError('FORBIDDEN')` in the example action.

### MUST-VERIFY (Phase 0, live)

- **V1 — wix-data `_owner` and permissions — ANSWERED for members (2026-10-28, V6 run).** Member insert: `_owner` = member id (token-info `subjectId`); member query returns only the member's items. A visitor token on a collection with Everyone=none is refused (`WDE0027`), so a visitor `_owner` was not observable there and is not needed by this design. Docs: [Data Item object (`_owner`)](https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/data-item-object), [Data Collection object (`permissions`)](https://dev.wix.com/docs/api-reference/business-solutions/cms/collection-management/data-collections/data-collection-object), [permission enforcement](https://dev.wix.com/docs/api-reference/business-solutions/cms/collection-management/data-collections/introduction#permissions).
- **V2 — permission-denied response shape.** **wix-data: ANSWERED** — refused insert/read returns code `WDE0027` ("The current user does not have permissions to insert/read on the <collection> collection"); `isPermissionDenied` matches `WDE0027` exactly. An invalid token returns `WDE0117` ("MetaSite not found") → generic failure. **Forms: OPEN** — which statuses `/form-submission-service/v4/submissions` returns for a refused caller (401/403 are undocumented for Create Submission); those become `isPermissionDenied`'s `WixApiError` fixtures.
- **V3 — no anonymous grant.** With the §Design 0 headers client and an access token that has expired: the call is rejected by Wix (record status/body), no request to `/oauth2/token` (none with `grantType: 'anonymous'`), `submitter` never a new visitor; an identity resolved within 60 s of expiry gives `'expired'` and `asCaller` throws `'expired'`.
- **V4 — fast-render output is never shared-cached**, in dev **and** on the production serving path, including any CDN in front of it: the fast render sets `Cache-Control: private` via its phase output's `responseHeaders`; check it reaches the HTTP response in dev and production, and that the CDN honours it. **Hard gate:** if the header does not reach the response or anything shared caches the page, `asCaller` in fast render is forbidden and the guide says so. Either way, the guide requires pages that render caller data to send `Cache-Control: private`.
- **V5 — restricted forms (hard prerequisite, with forms-side V2, for the forms `isPermissionDenied` tests).** `POST /form-submission-service/v4/submissions` with a visitor token on a form with spam protection / captcha, and on one with restricted submitters (members only). Record status + body. Captcha is expected to answer 428 `INVALID_CAPTCHA` (documented) → `SUBMIT_FAILED_MESSAGE`. **Also record whether a site post (`{ as: 'site' }`) passes captcha**; the `{ as: 'site' }` captcha guidance is published only if it does, otherwise the guide says such forms cannot be submitted server-side. Restricted submitters feed `isPermissionDenied`'s fixtures, or per the fallback get the generic message + `{ as: 'site' }` guidance.
- **V6 — headers-only client with headless tokens — PASSED (2026-10-28, test site).** `createClient({ modules: { items }, headers: { Authorization } })`, `@wix/sdk` 1.21.5 + `@wix/data`, collection `ProbeNotes` (Members=Add; Item's creator=View/Add/Update/Delete; Everyone=none). Member insert ok, `_owner` = member id; member query ok (count 1, all owned by the member). Visitor (anonymous-grant token) insert and query refused, `WDE0027`. Made-up token refused, `WDE0117` "MetaSite not found", no visitor fallback. `/oauth2/token` calls during all checks: **0**. Test item removed. `client.auth` on this client is the SDK's built-in default strategy (`getAuthHeaders` → `{ headers: {} }`), not OAuthStrategy: no refresh path.

## Scope pre-mortem

_"Six weeks later this failed. Why?"_

- **Forms broke for visitors** on forms configured for members only → generic message until V2 records a not-allowed status (then `SUBMIT_NOT_ALLOWED_MESSAGE`); guidance points to `{ as: 'site' }`.
- **An expired member silently became a new visitor** (SDK anonymous grant) → §Design 0's headers client has no OAuth strategy (V6: 0 `/oauth2/token` calls), so it cannot happen even when a token lapses mid-request; V3, V6; red tests advance time and assert no `/oauth2/token` call.
- **The headers client does not work with headless tokens** → retired: V6 PASSED for wix-data; forms covered by the `Authorization` probe.
- **A caller call went out unauthenticated** (default `client.auth` returns empty headers; `fetchWithAuth` drops `createClient`'s `headers`) → `wixFetch` throws without `Authorization`; `fetchWithAuth` is a throwing stub (`fetch` too, for one surface); red tests.
- **A caller identity leaked beyond the request via `enableContext('global')`** → stubbed to throw; red test.
- **A bad or foreign token was read as "not allowed"** → `WDE0117` maps to the generic failure, not `FORBIDDEN`.
- **Expired cookie tokens made submissions fail** → clear session-expired message; `ensureSessionFresh` before actions; fast render shows the no-caller state.
- **Captcha / spam-protected forms rejected visitor tokens** (428 `INVALID_CAPTCHA`) → V5; generic message; `{ as: 'site' }` guidance only if V5 shows the site passes captcha.
- **No server init → `siteOAuthClientId` throws for every form** → moved into the lazy `caller` getter (Q5b); only a hook reading `caller` hits L1.
- **A CDN cached a member's page** → V4 on production + `Cache-Control: private` in the guide.
- **A caller read leaked through a cache** → actions guarded by jay; slow render forbidden; V4 for fast render.
- **Someone reused the site singleton** for the caller → `asCaller` builds per call; test asserts it.
- **Scope creep:** caller mode for wix-stores/bookings/cart, a `wixData` caller default, caller-scoped schema calls, server-side token refresh. **All out of scope.**

## jay-feedback

- **Agent-kit (required).**
  - `packages/wix-forms/agent-kit/plugin/rich-forms.md` (submit-hook section): `submit()` posts as the caller when a session exists; `{ as: 'site' }` to opt out; a refusal is not retried and shows `SUBMIT_FAILED_MESSAGE` (`SUBMIT_NOT_ALLOWED_MESSAGE` only once V2 records the status); the remedy is `{ as: 'site' }`; an expired cookie does not block `{ as: 'site' }`; on the hook's `client` only `client.use(module)`, `client.graphql` and `wixFetch(..., { authorization })` work (`fetchWithAuth`/`fetch`/`enableContext` throw); an expired session shows `SUBMIT_SESSION_EXPIRED_MESSAGE`; a restricted-submitter form needs `{ as: 'site' }`; a captcha-protected form (428 `INVALID_CAPTCHA`) needs it only if V5 shows a site post passes captcha.
  - wix-data plugin agent-kit (new `packages/wix-data/agent-kit/plugin/caller-scoped-data.md`, as wix-data has no agent-kit folder today): server is site by default; `asCaller(resolveRequestIdentity(cookies))` for member-owned data; only in `.withRequest()` actions or fast render, never slow render, never with `.withCaching()`; **every** cookie-dependent fast render sends `Cache-Control: private` through its `responseHeaders`, the signed-out branch included; `NoCallerSessionError.reason` is `'none'` or `'expired'`; in fast render, an expired/missing session renders the signed-out state; map `isPermissionDenied` to `ActionError('FORBIDDEN')`; on the identity's `client` only `client.use(module)`, `client.graphql` and `wixFetch(..., { authorization })` work (`fetchWithAuth`/`fetch`/`enableContext` throw). wix-forms guide also: direct `WIX_FORMS_SERVICE.createSubmission(formId, values)` calls are unchanged and post as the site.
  - wix-server-client `packages/wix-server-client/agent-kit/plugin/wix-request-session.md` (+ the synced testbed copy): `session` (`none` / `active` / `expired`) — expired is not none: never fall back to the site on `'expired'`; `authorization`; `expiresAt`; `isExpiringSoon` / `EXPIRY_MARGIN_SECONDS`; `wixFetch(..., { authorization })` and that it throws rather than send an unauthenticated request; the caller client's supported surface (`use`, `graphql`, `wixFetch`) vs the throwing stubs (`fetch`, `fetchWithAuth`, `enableContext`).
- **Validation: none.** Slow-render misuse already throws (`NoCallerSessionError`, empty cookies), and jay's `.withRequest()`/`.withCaching()` guard already rejects caching. A static check that `asCaller` is not called from slow render would need call-graph analysis; not worth it now.

## Implementation Results

### Phases 1–3 (2026-10-28)

**Phase 1 — wix-server-client.** `resolveRequestIdentity` returns `session` / `authorization` / `expiresAt`; the caller client is `createClient({ modules: {}, headers: { Authorization } })` with `fetchWithAuth`, `fetch` and `enableContext` replaced by throwing stubs on the client itself. `decodeSessionCookie` rejects a missing or non-finite `expiresAt`. `siteOAuthClientId()` is read only in the lazy `caller` getter. `wixFetch` takes `authorization` and throws instead of sending no `Authorization`. `isPermissionDenied` matches exactly `WDE0027` and is false for every `WixApiError`. `index.ts` exports `isExpiringSoon`, `EXPIRY_MARGIN_SECONDS`, `SessionState`, `WixFetchOptions` and `isPermissionDenied`. Before the fix, the "lapses mid-request" test reproduced the bug: the OAuthStrategy client called `/oauth2/token` and sent no `Authorization`. DL#42's V13 session tests were moved to the new shape, and its Implementation Results record the change.

**Phase 2 — wix-forms.** As §Design 2: `SubmitOptions`, `CallerSession`, `SubmitDeps.resolveClient`, `createSubmission(formId, values, authorization?)`, `postedAs`, `SessionExpiredError`, `SUBMIT_NOT_ALLOWED_MESSAGE`, `SUBMIT_SESSION_EXPIRED_MESSAGE`, L6, no retry. `create-submission.ts` posts to `/form-submission-service/v4/submissions`. `WixFormsService.createSubmission` takes an optional `authorization`; wix-bookings, which only checks for the service, builds and tests unchanged.

**Phase 3 — wix-data.** `WixDataService.asCaller(identity)` and `NoCallerSessionError('none' | 'expired')`, built per call with `identity.client.use(items)`. `ItemsClient` is exported.

**Agent-kit (pre-V4/V5 subset).** The three guides from §jay-feedback were written, along with the synced testbed copy. Content gated by V2/V4/V5 is marked "pending verification" rather than published: the not-allowed message, the captcha `{ as: 'site' }` guidance and `asCaller` in fast render. The wix-data guide limits `asCaller` to `.withRequest()` actions until V4. wix-data now ships `agent-kit` in `files`.

**Test results.**

- wix-server-client: 50/51 (1 skipped: pending V2 `WixApiError(401/403)` rows).
- wix-forms: 142/143 (1 skipped: pending V2 not-allowed status).
- wix-data: 5/5.
- wix-bookings: 37/37.
- `tsc --noEmit` is clean and `npm run build` succeeds in all four packages.

### Deviations

- **The `WDE0027` fixture is SDK-produced, not a live capture.** `isPermissionDenied` is tested on the error that `@wix/sdk` throws when it receives the V2/V6-recorded body (`details.applicationError.code = 'WDE0027'` / `'WDE0117'`, driven through `@wix/data` with a mocked `fetch`). If a live capture during V2 shows a different shape, update the test and the helper.
- **428 `SITE_IS_A_TEMPLATE` on a caller post logs L4, not L6** (per Q4, "generic L4 for caller and site posts"). §Design 2's ordering of the `failed` row would otherwise have sent it to L6. The code is read from the `WixApiError` body.
- **`isExpiringSoon(undefined)` is true.** A missing expiry is treated as expired. It cannot occur for `'active'`, because the cookie decoder rejects it.
- **`identitySubmitDeps(identity)`** (in `run-submission.ts`) builds `resolveClient` and `resolveIdentity` from one shared identity, so the "a form without a hook does not call token-info" test exercises the real wiring. `forms-actions.ts` uses it. `createSubmitAttempt` is exported for the `postedAs` tests.
- **Test tooling:** wix-data had no test runner. It now has `vitest run`, a `vitest` devDependency and a `node` test environment (the `jsdom` environment it named was not installed). wix-server-client declares `@wix/data` as a devDependency for its caller-client tests.

### Pending for Phase 4

- **V2 (forms side):** the refusal status for `/form-submission-service/v4/submissions`. Then fill in the skipped `isPermissionDenied` `WixApiError` rows and the skipped `SUBMIT_NOT_ALLOWED_MESSAGE` test, and un-gate the guide sentence.
- **V3:** live check of an expired token through the headers client (status/body, no `/oauth2/token`).
- **V4 (hard gate):** `Cache-Control: private` from fast render, in dev and in production/CDN. Until then, `asCaller` in fast render stays out of the guide.
- **V5:** restricted-submitter and captcha forms with a visitor token, and whether a site post passes captcha. This decides the captcha `{ as: 'site' }` guidance.
- **Remaining DL#05/#42 notes:** add DL#05's note.
- **Demo:** `/demo-feature` with visitor `submitter.visitorId` and member `submitter.memberId`.
- **Final step:** the readme cross-cutting line, when the status moves to Implemented.

### Port to main (2026-11-08)

Phases 1–3 and the agent-kit guides were ported onto main after DL#41, DL#42 and DL#45 had merged. The design is unchanged. Differences from the run above:

- **DL#45 `reason` on every failure.** DL#45 (merged before this port) requires `reason: SubmitFailure` on each `{ success: false }` result. The new failure paths map onto DL#45's rules, adding no new codes:
  - `SessionExpiredError` → `PERMISSION` (a sign-in problem, like a 401), with `SUBMIT_SESSION_EXPIRED_MESSAGE`;
  - a caller refusal where `isPermissionDenied` → `PERMISSION`, with `SUBMIT_NOT_ALLOWED_MESSAGE`;
  - other caller and site refusals → DL#45's `wixFailureReason` (401/403 → `PERMISSION`, other `WixApiError` → `REJECTED`, no answer → `UNKNOWN`);
  - field violations → `VALIDATION`;
  - the new L1 path (`resolveClient` throws, or an active session without `authorization`) → `UNKNOWN`, the same as the existing L1 path.

  The Phase 2 tests expect these reasons. The two L1 tests had expected no `reason` and passed only because the code also omitted it; both now expect `UNKNOWN`.

- **The guide notes `submitFailure: PERMISSION`** for an expired session, so a page can write its own sign-in copy (DL#45's variants).
- **wix-data test tooling.** main's wix-data already runs a `node --test` file. Instead of switching the package's vite config to `node`, the `test` script runs `vitest run --environment node test/as-caller.test.ts` and then the `node --test` file; `vitest` is a devDependency (`^4.1.11`, as in the other packages). The vite config still names `jsdom`, which is not installed.
- **wix-server-client** declares `@wix/data` (`^1.0.433`) as a devDependency for its caller-client tests.
- **No testbed copy** of the wix-server-client guide (the example app is not part of this change).

**Test results (port).**

- wix-server-client: 70/71 (1 skipped: pending V2 `WixApiError(401/403)` rows).
- wix-forms: 163/164 (1 skipped: pending V2 not-allowed status).
- wix-data: 5/5 vitest + 2/2 `node --test`.
- wix-bookings: 49/49. Root `yarn test` exits 0.
- Typecheck is clean for wix-server-client, wix-forms and wix-bookings, and `npm run build` with `validate-plugin` succeeds for wix-server-client, wix-forms, wix-data and wix-bookings. wix-data's `tsc` fails on main's `test/source-editing.test.ts` (a `.ts` import extension); this predates the port and is not changed here.

### Review: how `isPermissionDenied` detects a refusal (2026-11-09) — decided, implemented

> **Outcome, read first.** `WDE0027` **is** an officially documented Wix Data error code: it is listed on [Wix Data Error Codes](https://dev.wix.com/docs/api-reference/business-solutions/cms/wix-data-error-codes), together with `WDE0177` (the same refusal in a sandbox environment). Matching it is safe. The owner chose to split the check by owner: wix-data's `isDataPermissionDenied` matches those codes, and wix-server-client's `isPermissionDenied` matches HTTP 403. The text below records how the review reached that decision.

**Problem 1 (as first raised; it turned out to be wrong): "`WDE0027` is not a documented contract".** It was first thought to be known only from V2/V6 and Wix forums. It is in fact documented (see the outcome above). The remaining real issue was ownership (Problem 2).

**Problem 2: a data-specific code lives in wix-server-client.** `WDE0027` is a Wix Data code, but the helper sits in the shared server-client package.

**Findings.**

- Wix documents the HTTP status as the error category: [About Errors](https://dev.wix.com/docs/api-reference/articles/work-with-wix-apis/troubleshooting/about-errors) says _403 – Permission denied: the system authenticated you, but you don't have permissions to call this API_, and _401 – Unauthorized: missing/incorrect Authorization or an expired token; occasionally returned when you don't have permissions_. The same page documents `details.applicationError.code` as a per-service identifier, not a shared vocabulary.
- `@wix/sdk-runtime` `transformError` copies the HTTP status onto the thrown error (`error.status`) for application, validation and plain 4xx errors. Our own `WixApiError` already has `status`. (Corrected below: `@wix/data` does not go through `transformError` and throws an error with no `status`.)
- Not yet measured: the HTTP status of the `WDE0027` refusal. The V2/V6 notes record only the code and message; the unit fixture's 403 (and 401 for `WDE0117`) is an assumption.

**Proposed rule.** `isPermissionDenied(error)` is true when `error.status === 403`, for an SDK error or a `WixApiError`. No application code is matched.

- 401 stays false. It means "not authenticated" (bad or expired token, like `WDE0117`) and keeps going to the generic or session-expired path. If Wix ever answers a permission refusal with 401, the user gets the generic message — the safe direction.
- The helper is no longer data-specific, so it stays in wix-server-client as a general "Wix refused this caller" check. Moving it to wix-data would make wix-forms (which posts through `wixFetch` and gets a `WixApiError`) depend on wix-data. If the owner prefers keeping a code check instead, it belongs in wix-data and wix-forms gets its own status check.
- Side effect: forms is covered as soon as Create Submission returns 403, so the skipped forms-side V2 rows become "403 → true, 401 → false" plus a live check.

**Must verify before changing code (V2b, live).** With a visitor token on a collection where Everyone has no access, record the HTTP status of the `WDE0027` refusal and of the `WDE0117` made-up token. The 403 rule ships only if the refusal is 403. If it is not, keep the code match, move it to wix-data, and record why.

**Tests (red-first once approved).** True for an SDK data error with status 403 (any application code) and for `WixApiError(403)`; false for 401 (`WDE0117`), 400, 428, 500, network and `undefined`. Fixtures use the V2b-recorded status. The two agent-kit guides drop the `WDE0027` wording and say "HTTP 403".

**Owner approved the 403 rule (2026-11-09). Implementation found two facts that contradict this proposal; paused for a new decision.**

- **`WDE0027` is documented.** [Wix Data Error Codes](https://dev.wix.com/docs/api-reference/business-solutions/cms/wix-data-error-codes) lists `WDE0027` ("The current user does not have permissions to {action} on the {collection} collection") and `WDE0177` (the same refusal in a sandbox environment). `WDE0117` is listed as "MetaSiteId can not be resolved", a system error. The `@wix/wix-data-items-sdk` source links to that page. So Problem 1 above was wrong.
- **`@wix/data` drops the HTTP status.** A `@wix/data` `items.insert` refused with HTTP 403 throws an `Error` whose only own property is `details` (`details.applicationError.code`). It has no `status` and no `response` (measured with `@wix/data` 1.0.433 and a mocked `fetch`). The generic `@wix/sdk-runtime` `transformError` does set `status`, but the data module does not go through it. A 403-only rule therefore never matches a Wix Data refusal.

**Decision (owner, 2026-11-09): split by owner.**

- **wix-server-client `isPermissionDenied(error)`**: `error.status === 403`. It covers `wixFetch` refusals (`WixApiError`), which is what wix-forms gets. No Wix Data code remains in this package.
- **wix-data `isDataPermissionDenied(error)`** (new export): `details.applicationError.code` is `WDE0027` or `WDE0177`, the documented permission codes. `WDE0117` and other codes are false.

**Implementation results (2026-11-09).**

- `wix-fetch.ts`: the 403 rule. The `@wix/data`-driven fixtures moved to wix-data's tests; wix-server-client tests a real `wixFetch` 403 (true) and 401 / 400 / 428 / 500 / network / `undefined` (false). The skipped "pending V2" row is removed.
- wix-forms: a caller 403 now returns `SUBMIT_NOT_ALLOWED_MESSAGE` (`reason: PERMISSION`). The two caller-refusal tests were updated to that message, a caller 401 test keeps the generic message, and the skipped "pending V2" test is removed. A 403 on a site post keeps the generic message.
- wix-data: `isDataPermissionDenied` in `wix-data-service.ts`, exported from `index.ts`; tests drive the real `@wix/data` client with a mocked `fetch`.
- Guides: `wix-request-session.md` (403, and "use `isDataPermissionDenied` for Wix Data"), `caller-scoped-data.md` (the example uses `isDataPermissionDenied`, with the docs link), `rich-forms.md` (403 shows "Please sign in to submit this form.").
- Tests: wix-server-client 70/70, wix-forms 164/164, wix-data 7/7 vitest + 2/2 `node --test`, wix-bookings 49/49. `npm run build` succeeds in all four; typecheck is clean except wix-data's existing `source-editing.test.ts` error.
- **Still open (live):** forms-side V2. Wix's documentation says 403 means permission denied, but it has not been measured that Create Submission returns 403 to a refused caller. Until it is, a refused forms caller may still get the generic message.

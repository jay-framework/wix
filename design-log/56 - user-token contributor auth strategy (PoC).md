# 56 - User-token (contributor) auth strategy for wix-server-client (PoC)

> **Candidate / requirement — PoC.** Written by the Jay online-editor (jay-ci) side as a request for this repo. Goal: add a Wix **user-token** auth strategy to `wix-server-client` and verify, on the examples, whether the data plane accepts a **contributor (Wix-user)** identity. Do not ship as the default; this is an exploratory PoC whose result decides a jay-ci design choice.

## Background

- DL #29/#54 added **`appStrategy`** (`appId`+`appSecret`+`siteId`+`instanceId`): the dev server authenticates as the **headless companion app**.
- Jay's online editor (jay-ci) runs a **dev-machine pod per contributor session**. Two problems with `appStrategy` there:
  1. **Escalation / confused-deputy.** The app secret sits on a pod the contributor controls (their code + an AI agent run in it). The companion app's permissions can be **broader** than the contributor's own role, so the contributor could use the secret to exceed their permissions.
  2. **Privileged fetch.** jay-ci would have to read the per-site companion app's Dev Center secret (`GetApp` + `APP_SECRETS`) — an app-ownership-grade, security-gated operation.
- jay-ci already mints a **contributor-scoped Wix user access token** (`WIX_TOKEN`, via oauth2-ng `authorized_client`) for its git transport. Reusing that same token for `wix-server-client` would scope the dev server's Wix calls to the **contributor's own permissions** — least privilege, no app secret on the pod, no privileged secret read.

## Problem

`wix-server-client` supports `visitor` (OAuthStrategy/clientId), `apiKey`, and `app` (AppStrategy) — but **no way to authenticate as a specific Wix user from a raw access token**. We need one, and we need to know whether it actually works for the editor's data needs.

## Questions

1. **How does `@wix/sdk` authenticate from a raw user access token?** Likely a minimal custom `AuthenticationStrategy` whose `getAuthHeaders()` returns `{ Authorization: <token> }`, or `OAuthStrategy({ clientId })` + `client.auth.setTokens({ accessToken })`. Which does the SDK support cleanly for a **Wix-user** token?
2. **(Pivotal) Does the data plane accept a Wix-_user_ identity?** `wix-data` / stores / cart / dynamic-contract authorize by **visitor/member/app** in the usual storefront path. A `WIX_TOKEN` is a **Wix user** (contributor/dashboard) identity. Do those calls succeed, fail, or behave as backoffice under it?
3. **App-instance-scoped data.** Is data/collections scoped to the app instance reachable under a user identity (no `instanceId`)?

## Design (requirement)

- **New strategy** in `config/.wix.yaml` (xor with the others):
  ```yaml
  userTokenStrategy:
    token: <WIX_USER_ACCESS_TOKEN> # a contributor's Wix user access token
  ```
  (Accept an env fallback, e.g. `WIX_TOKEN`, so the PoC can inject it without writing the secret to disk.)
- **`config-loader.ts`** — add a `userToken` kind; validate `token` non-empty; include in the strategy xor check.
- **`server-auth.ts`** — add a case returning an auth strategy that authenticates as the user from `token` (custom `getAuthHeaders` → `Authorization: token`, or OAuthStrategy+`setTokens`). Keep `verifyServerAuth` working (it calls `getAuthHeaders`).
- **`wix-client-service.ts`** — no change (consumes `serverAuthStrategy`).

## Implementation Plan (PoC)

1. Add the `userTokenStrategy` as above.
2. Run an example (e.g. `examples/store-light`) with `userTokenStrategy` set to a **contributor's** Wix user access token. (A token the developer already holds acting as a contributor/owner — e.g. from `wix login` / `~/.wix/auth/account.json` `accessToken` — is fine for the mechanism; the production token is jay-ci's oauth2-ng mint.)
3. Exercise the data plane and **record pass/fail + error detail** for:
   - `wix-data`: query a collection
   - stores: list products / cart
   - the **dynamic-contract materialization** that fails under clientId-only config
4. Report: which calls work as the contributor, which error (and whether it's an **identity-type** rejection vs a **permission** error), and whether app-instance-scoped data is reachable.

## Trade-offs / notes

- **If it works:** least-privilege (dev server scoped to the contributor), **no app secret on the pod**, and jay-ci drops the privileged companion-secret read. `WIX_TOKEN` becomes the single credential for both the git transport and the data plane.
- **If it fails** (data plane rejects Wix-user identity): jay-ci falls back to `appStrategy` (DL #54). **This PoC is the deciding test** for that choice.
- **Out of scope for the PoC:** token **expiry/refresh**. A user token has a TTL and the pod can't self-refresh; the real design needs re-mint/refresh. The PoC may use a static, freshly-minted token.
- Do **not** make `userTokenStrategy` a default or write it in `setup.ts`; it's exploratory until the result is in.

## Verification Criteria

- `wix-server-client` initializes with `userTokenStrategy` on an example and `verifyServerAuth` passes.
- A clear pass/fail table for the data-plane calls above, with the **answer to Q2**: _does a contributor (Wix-user) token authenticate the editor's data plane?_

## Implementation Results (2026-11-12)

### Answers

1. **SDK mechanism (Q1):** a minimal custom `AuthenticationStrategy` whose `getAuthHeaders()` returns `{ Authorization: <token> }`, plus `wix-site-id` when `siteId` is set (as `ApiKeyStrategy` does). `createClient` accepts it with no casts. `OAuthStrategy` + `setTokens` was not needed.
2. **Data plane under a Wix-user identity (Q2): yes.** On `store-light` (site `88dfc801…`, catalog V3), a site-scoped token from `wix token --site` (`token-info`: `subjectType=USER`) passed every read the editor needs. No identity-type rejection anywhere.
3. **App-instance-scoped data (Q3): reachable.** `jay-backend-files`, which wix-deploy creates with the app token, was readable as the user. A visitor gets `WDE0027` on it.

### Probe (`exploration/user-token-auth/probe.mjs`)

| Call                                              | userToken                   | app (DL #54)      | visitor           |
| ------------------------------------------------- | --------------------------- | ----------------- | ----------------- |
| token-info                                        | ✓ USER, active, site-scoped | —                 | —                 |
| stores: catalog version                           | ✓ V3                        | ✓ V3              | ✓ V3              |
| stores: products search                           | ✓ 12                        | ✓ 12              | ✓ 12              |
| stores: categories (`@wix/stores` tree)           | ✓ 1                         | ✓ 1               | ✓ 1               |
| stores: data extension schemas (materialization)  | ✓ 0                         | ✓ 0               | ✓ 0               |
| wix-data: list collections (contract generation)  | ✓ 16                        | ✓ 19              | ✗ 403             |
| wix-data: query `jay-backend-files` (app-created) | ✓                           | ✓                 | ✗ WDE0027         |
| cart: get current cart                            | ✗ no current cart           | ✗ no current cart | ✗ no current cart |

- **Collection-list difference:** only the app sees `Stores/{Collections,InventoryItems,Orders,Products,Variants}` (the V1 catalog's collections; this site is V3). Only the user sees `eCommerce/Orders` and `Locations/Locations`. Neither difference blocks contract generation here.
- **Cart:** the current cart belongs to a visitor or member, so it is "not found" for every server identity. That is not an identity rejection. Carts run in the browser with visitor tokens (wix-cart client context).

### End to end on `examples/store-light`

The config was `userTokenStrategy: { siteId }`, with the token only in `WIX_TOKEN`:

- `jay-stack-cli setup` (non-interactive): **4/4 configured.** wix-server-client reported "connected (Wix user token)" after the token-info check; wix-deploy found its collection; the wix-stores catalog check passed; wix-media was verified.
- `jay-stack-cli agent-kit`: materialized 8 contracts plus the stores categories and media references. The output matched the committed files byte for byte.
- `jay-stack-cli dev`: `/products` rendered all 12 products, `/products/baseball-cap` rendered its product page, and the dev log showed no auth errors.

### Code

- `config-loader.ts`: `ServerAuthConfig` gains `{ kind: 'userToken'; userToken: { token, siteId? } }`. `userTokenStrategy.token` falls back to `WIX_TOKEN`, but only when a `userTokenStrategy` section exists, so a visitor config stays visitor even if `WIX_TOKEN` is set. The three server strategies are mutually exclusive.
- `server-auth.ts`: adds the `userTokenStrategy()` headers. `verifyServerAuth` also calls `POST /oauth2/token-info` and fails when `active` is false, because building the headers alone can never fail.
- `setup.ts`: recognizes `userTokenStrategy` as configured and verifies it. It never writes one (per this DL).
- `get-dashboard-url.ts`: uses `userToken.siteId` when present.
- Tests: `config-loader.test.ts` (config and env token, missing token, exclusivity, `WIX_TOKEN` ignored without the section) and the new `server-auth.test.ts` (headers with and without a site). wix-server-client 108/108.

### Not covered

- **Permissions below owner:** the token belonged to the site owner. The PoC shows a Wix-user identity is _accepted_. It does not show how a contributor with a narrower role fares; expect permission errors (403), not identity rejections. That needs a test with a real contributor token from jay-ci's oauth2-ng mint.
- **Expiry:** the CLI token has a short TTL, and nothing refreshes it (out of scope). A long-running pod will see `verifyServerAuth` and calls fail once it expires.
- **Writes:** only reads were probed, apart from wix-deploy's existing-collection check. Cart and checkout writes run in the browser, not with this identity.

> Numbered **#56** in this repo: the request arrived as "55", but #55 was already taken on `main` (wix validation parity for wix-forms).

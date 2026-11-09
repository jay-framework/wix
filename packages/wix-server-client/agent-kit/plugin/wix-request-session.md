# Wix request session: who is calling, on the server

## Site by default, the caller when the request carries a session

| Where the Wix call runs | Credential | Whose permissions apply |
|---|---|---|
| Server, default (actions, slow/fast render, plugin services) | `WIX_CLIENT_SERVICE` (API key / app) | **The site** (elevated) |
| Server, request with an active `wix_session` cookie | `resolveRequestIdentity(request.cookies).client` | **The visitor/member** |
| Browser (interactive phase) | `WIX_CLIENT_CONTEXT` (OAuth tokens in localStorage) | **The visitor/member** |

So server code that calls Wix through `WIX_CLIENT_SERVICE` bypasses member-only rules (for
example, wix-data collection permissions). Use the request client when Wix must enforce them.

The browser owns the OAuth tokens. wix-server-client mirrors the **access token only** into an
httpOnly, `Secure`, `SameSite=Lax` `wix_session` cookie whenever it changes (login, renewal,
logout), after verifying it with Wix's `oauth2/token-info`. The refresh token never leaves the
browser. A malformed token, or one whose cookie value would exceed 3072 characters, is refused
and the cookie cleared. Nothing to wire up: it happens inside the plugin.

`wix_session` is `Secure`: develop on `http://localhost` or over https. Over plain http on any
other host (a LAN IP, a custom `.test` host) the session is never kept, and every caller-session
feature (form submits, wix-data `asCaller`) behaves as signed-out.

## Reading it in an action

Use `resolveRequestIdentity` only in POST actions (`makeJayAction`), never in `makeJayQuery`:
`wix_session` is `SameSite=Lax`, so it rides on cross-site GET navigations.

```ts
import { makeJayAction, ActionError } from '@jay-framework/fullstack-component';
import { resolveRequestIdentity } from '@jay-framework/wix-server-client';

export const myAction = makeJayAction('mySite.myAction')
  .withRequest()                                   // gives the handler `request.cookies`
  .withHandler(async (input: MyInput, request) => {
    const { caller, client } = resolveRequestIdentity(request.cookies);
    const verified = await caller;                 // one token-info call, only when awaited
    if (verified?.type !== 'MEMBER') throw new ActionError('SIGN_IN_REQUIRED', 'Please sign in.');
    // `client` acts as the caller: Wix applies the caller's permissions.
  });
```

- `caller`: `Promise<{ type: 'VISITOR' | 'MEMBER'; id } | undefined>`. Verified with Wix; `undefined`
  means no proof (no cookie, an expired or forged token). It rejects only when Wix's token-info is
  unreachable: fail the request with a generic message.
- A `VISITOR` caller proves a browser session only (anyone can mint one). Need a person? Require
  `MEMBER`.
- `session`: `'none' | 'active' | 'expired'`. **Expired is not none**: never fall back to the site on
  `'expired'`. A token within `EXPIRY_MARGIN_SECONDS` (60 s) of expiry counts as expired;
  `isExpiringSoon(expiresAt)` is that one rule.
- `client`: a Wix client acting as the caller, set only when `session === 'active'`. It needs no
  check: Wix rejects a bad token when it is used. It carries the access token as a header and has
  no OAuth strategy, so it never renews a token and never becomes an anonymous visitor: a token
  that lapses mid-request is rejected by Wix.
- `authorization`: the access-token value (set when `'active'`), for `wixFetch`. Never log it.
- `expiresAt`: the access-token expiry in epoch seconds (set for `'active'` and `'expired'`).
- The server never refreshes tokens. Records are keyed on `caller.id`, never on an id the browser
  sent.

## Calling Wix as the caller

On the caller `client`, only these work:

| Supported | Throws |
|---|---|
| `client.use(module)` (e.g. `client.use(items)`), `client.graphql(...)` | `client.fetchWithAuth`, `client.fetch`, `client.enableContext` |
| `wixFetch(client, path, { authorization })` | |

```ts
import { resolveRequestIdentity, wixFetch } from '@jay-framework/wix-server-client';

const identity = resolveRequestIdentity(request.cookies);
if (identity.session === 'active') {
  await wixFetch(identity.client!, '/some/v1/endpoint', { method: 'POST', body, authorization: identity.authorization });
}
```

`wixFetch` with `authorization` sends exactly that token, never the site's credentials. Without it,
`wixFetch` uses the client's own auth (the site client) and **throws rather than send an
unauthenticated request**, for example when given the caller client without `authorization`.

`isPermissionDenied(error)` is true when Wix refused a `wixFetch` call for the caller's permissions
(HTTP 403); map it to `ActionError('FORBIDDEN', ...)`. A 401 (invalid or expired token) is not a
permission refusal. `@wix/data` errors carry no HTTP status: for Wix Data calls use wix-data's
`isDataPermissionDenied`.

## Before a cookie-dependent action, in the browser

```ts
import { ensureSessionFresh } from '@jay-framework/wix-server-client/client';

await ensureSessionFresh(); // renews an expired token and waits until the cookie mirrors it; never throws
await myAction(input);
```

wix-forms already does this before `submitForm`.

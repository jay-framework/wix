# Wix request session: who is calling, on the server

## Site by default, the caller when the request carries a session

| Where the Wix call runs | Credential | Whose permissions apply |
|---|---|---|
| Server, default (actions, slow/fast render, plugin services) | `WIX_CLIENT_SERVICE` (API key / app) | **The site** (elevated) |
| Server, request with a `wix_session` cookie | `resolveRequestIdentity(request.cookies).client` | **The visitor/member** |
| Browser (interactive phase) | `WIX_CLIENT_CONTEXT` (OAuth tokens in localStorage) | **The visitor/member** |

So server code that calls Wix through `WIX_CLIENT_SERVICE` bypasses member-only rules (for
example, wix-data collection permissions). Use the request client when Wix must enforce them.

The browser owns the OAuth tokens. wix-server-client mirrors them into an httpOnly `wix_session`
cookie whenever the access token changes (login, renewal, logout), after verifying them with
Wix's `oauth2/token-info`. Nothing to wire up: it happens inside the plugin.

## Reading it in an action

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
- `client`: a Wix client acting as the caller, or `undefined` without a cookie. It needs no check:
  Wix rejects a bad token when it is used.
- The server never refreshes tokens. Records are keyed on `caller.id`, never on an id the browser
  sent.

## Before a cookie-dependent action, in the browser

```ts
import { ensureSessionFresh } from '@jay-framework/wix-server-client/client';

await ensureSessionFresh(); // renews an expired token and waits until the cookie mirrors it; never throws
await myAction(input);
```

wix-forms already does this before `submitForm`.

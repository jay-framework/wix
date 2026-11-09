# Caller-scoped data: reading and writing as the visitor/member on the server

## The site by default

On the server, `WIX_DATA_SERVICE_MARKER`'s `items` and every wix-data action (`queryItems`,
`getItemBySlug`, `getCategories`) run as **the site** (elevated). Wix does not apply a collection's
permissions to them, and an item the site inserts is owned by the site, not the member.

When Wix must apply the caller's permissions, or `_owner` must be the member (a member's favourites,
their own records), opt in per call with `asCaller`:

```ts
import { makeJayAction, ActionError } from '@jay-framework/fullstack-component';
import { resolveRequestIdentity } from '@jay-framework/wix-server-client';
import {
  WIX_DATA_SERVICE_MARKER,
  NoCallerSessionError,
  isDataPermissionDenied,
} from '@jay-framework/wix-data';

export const saveFavourite = makeJayAction('app.saveFavourite')
  .withRequest()                                   // gives the handler `request.cookies`
  .withServices(WIX_DATA_SERVICE_MARKER)
  .withHandler(async (input: { itemId: string }, request, wixData) => {
    try {
      const items = wixData.asCaller(resolveRequestIdentity(request.cookies));
      return await items.insert('Favourites', { itemId: input.itemId });
    } catch (error) {
      if (error instanceof NoCallerSessionError || isDataPermissionDenied(error))
        throw new ActionError('FORBIDDEN', 'Sign in to save favourites.');
      throw error;
    }
  });
```

## Rules

- `asCaller(identity)` returns the Wix Data **items** client acting as the caller. Collections and
  schemas stay site-scoped.
- It **throws** `NoCallerSessionError` unless the session is active. `error.reason` is `'none'` (no
  session cookie, or a handler called outside an HTTP request) or `'expired'`. It never falls back to
  the site; do not catch it and retry with `wixData.items`.
- Use it only in `.withRequest()` actions. **Never** with `.withCaching()` (jay refuses that
  combination) and **never** in slow render (no cookies; its output is shared).
- Fast render: **pending verification**. It is not yet verified that a private `Cache-Control` header
  reaches the response and that nothing shared caches the page, so do not call `asCaller` in fast
  render yet. Load the caller's data in the interactive phase (`WIX_DATA_CONTEXT` already runs as the
  visitor/member).
- Map `isDataPermissionDenied(error)` to `ActionError('FORBIDDEN', ...)`. It matches the documented
  [Wix Data error codes](https://dev.wix.com/docs/api-reference/business-solutions/cms/wix-data-error-codes)
  `WDE0027` and `WDE0177` ("the current user does not have permissions"). Do not use
  wix-server-client's `isPermissionDenied` here: `@wix/data` errors carry no HTTP status.
- The caller client supports only `client.use(module)`, `client.graphql` and
  `wixFetch(..., { authorization })`; `fetchWithAuth`, `fetch` and `enableContext` throw.

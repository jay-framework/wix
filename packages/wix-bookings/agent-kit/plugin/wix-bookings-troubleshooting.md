Wix Bookings troubleshooting — progressive 403s, redirect errors, and verification.

## Progressive 403 errors

Wix returns **403** until each required permission is granted. Fix them in order as you test the flow:

1. **Services list empty / 403 on `/bookings/v2/services/query`**
   - Enable **Wix Bookings** on API key

2. **403 on `/ecom/v2/carts` after Confirm Booking**
   - Enable **Wix eCommerce** (Write Carts v2 / Manage eCommerce) on API key

3. **403 on `/headless/v1/redirect-session`**
   - Enable **Headless** (redirect sessions) on API key

For local smoke tests, **All site permissions** is acceptable temporarily.

## Headless redirect errors

| Error | Cause | Fix |
|-------|-------|-----|
| 400 on redirect-session | `postFlowUrl` domain not in Headless allowlist | Add `localhost:3000` (or deployed domain) to **Allowed redirect domains** |
| 404 on redirect-session | Wrong endpoint `/redirects-api/v1/redirect-session` | Use `/headless/v1/redirect-session` only |
| 428 SITE_NOT_PUBLISHED | Site not published | Publish the Wix site |

**Fallback:** If redirect-session fails with 400/404, the service falls back to `POST /ecom/v2/carts/{cartId}/get-checkout-url`. That opens Wix checkout but may not return to your `postFlowUrl`.

## Implementation pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Browser crash `createRequire is not defined` | Server bundle imported in client | Use `index.client.ts` for client; dynamic imports in `init.ts` |
| Contract validation failed | Arrays as `dataType: array` | Use `sub-contract` + `repeated: true` |
| `getService(WIX_CLIENT_SERVICE)` wrong shape | Assumed `{ wixClient }` wrapper | Service returns `WixClient` directly |
| Paid checkout 400 | `postFlowUrl` domain not in Headless allowlist | Add domain to **Allowed redirect domains** |
| Paid checkout 404 | Wrong redirect endpoint | Use `/headless/v1/redirect-session`, not redirects-api |

## Participant form fields empty

Bookings loads participant fields via `getFormSummary` from `@jay-framework/wix-forms`:

- Ensure `wix-forms` is set up and API key has **Wix Forms** permission
- Service must have a `form._id` in the Wix Bookings schema

## Do not assume success from redirect alone

`postFlowUrl` fires when the user **finishes or abandons** checkout. For production, look up booking/order status rather than showing confirmation solely on page return.

## Config troubleshooting

| Symptom | Check |
|---------|-------|
| No services | `bookingAppId` in `config/.wix-bookings.yaml` |
| Slot query fails | `staffResourceTypeId` matches site resource type |
| Wrong return URL after checkout | `postCheckoutUrl` in config |

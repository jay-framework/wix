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
- A service's participant form is `form.id` in the Wix Bookings service. The all-zero id
  (`00000000-0000-0000-0000-000000000000`) means the site default form: the plugin then shows its
  built-in First name / Last name / Email fields and does not call `getFormSummary`
- `formId` in `agent-kit/references/wix-bookings/services.yaml` is empty for those default-form services
- Changed a service in the dashboard (e.g. assigned a custom form) and the page still shows the old
  data: the services list is slow-rendered and stays fresh for 10 minutes. Restart the dev server,
  or wait, before re-testing
- Fields show `required: false` even when Wix requires them: the Form Summary API does not
  carry `required`. **`createBooking` does not enforce it either** — QA 2026-11-10 booked a form
  with a required Address and got 200 without one
- **Known gap — fields are dropped:** only text, email, phone, number and URL fields are shown.
  Address (and other non-text fields) are silently left out of the participant form, even when
  required. Wix checkout does not ask for them either, so the booking is confirmed without them.
  Do not put address or other non-text fields on a booking form until this is fixed

## Do not assume success from redirect alone

`postFlowUrl` fires when the user **finishes or abandons** checkout. For production, look up booking/order status rather than showing confirmation solely on page return.

## Config troubleshooting

| Symptom | Check |
|---------|-------|
| No services | `bookingAppId` in `config/.wix-bookings.yaml`; API key **Wix Bookings** permission |
| Slot query fails / no availability | `staffResourceTypeId` in config — must be the staff resource's `typeId` on this site |
| Setup could not fill `staffResourceTypeId` | No staff on site — add staff in Bookings dashboard and re-run `jay-stack setup wix-bookings` |
| `staffResourceTypeId` looks wrong | Compare `staffResourceTypeIdFromConfig` vs `staffResourceTypeIdDiscovered` in `agent-kit/references/wix-bookings/site.yaml` after `jay-stack agent-kit` |
| Agent cannot name a service | Refresh `agent-kit/references/wix-bookings/services.yaml` (`jay-stack agent-kit`) |
| Wrong return URL after checkout | `postCheckoutUrl` in config |

### `staffResourceTypeId` manual recovery

When setup returns `needs-config` for staff:

1. In Wix Bookings, ensure at least one **staff member** exists.
2. Re-run `jay-stack setup wix-bookings`, **or**
3. Call `POST /bookings/v2/resources/query`, find a resource linked to staff, and set `staffResourceTypeId` to that resource's `typeId` in `config/.wix-bookings.yaml`.

Runtime slot queries pass this value as `resourceTypeId` when the service allows any staff member (`ANY_RESOURCE`). An empty or wrong value causes Wix to reject the slot request.

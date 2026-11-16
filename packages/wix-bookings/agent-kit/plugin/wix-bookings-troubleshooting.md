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

Bookings loads participant fields via `wixBookings.getParticipantForm` (Wix Get Form):

- Ensure `wix-forms` is set up and API key has **Wix Forms** permission
- A service's participant form is `form.id` in the Wix Bookings service. The all-zero id
  (`00000000-0000-0000-0000-000000000000`) is the site default "Booking form", read like any form;
  `services.yaml` lists it as the service's `formId`. A required field it cannot show gives
  `FORM_UNSUPPORTED`
- Changed a service or form in the dashboard and the page still shows the old data: the services
  list is slow-rendered and the participant form is cached, both for 10 minutes. Restart the dev
  server, or wait, before re-testing
- `required` is Wix's real flag (Get Form). Wix's `createBooking` does not enforce it — QA
  2026-11-10 booked a form with a required Address and got 200 without one — so the plugin's
  `createBooking` re-validates every field on the server and refuses a missing required value
  (`bookingFailure === VALIDATION`)
- **`FORM_UNSUPPORTED`:** a **required** field uses a kind this version cannot show (dropdown,
  date picker, checkbox group, file upload, number, a second address, …): booking is disabled for that
  service, and `bookingError` names the field. Make the field optional in the Wix dashboard (or
  remove it), or upgrade the plugin. An **optional** field of such a kind is left out of the
  participant form with a server warning (`[wix-bookings] …`), and never sent
- Shown kinds: text, long text, email, phone, URL, a Multi-line address (the `address` tag, see
  setup §6), and a single checkbox (`type === BOOLEAN`, bind
  it to `<input type="checkbox">`). Hidden fields are ignored with a server warning

## Address problems

- **"Country/Region is required." and the page has no address control:** the page binds no
  address refs. Add the address markup (setup §6). The `BOOKINGS-ADDRESS-UNBOUND` validator
  finding reports this at build time.
- **`FORM_UNAVAILABLE` / "Could not load the address layouts":** the plugin could not fetch the
  address layouts from Wix (List Form Templates): a network or API-key problem, retried after 30 s.
  If the QA-only `WIX_FORMS_ADDRESS_TEMPLATES_ORIGIN` environment variable is set, unset it and
  restart.
- **"This address cannot be accepted for <country>. Please contact us.":** Wix requires an address
  part outside the eight the plugin knows. Run the L-drift probe (`scripts/address-map-probe.mjs`
  in `@jay-framework/wix-forms`) and report the country, part and rule.
- **`[wix-forms] address drift: …` in the server log:** Wix answered differently from the plugin's
  country layout map. See "Address drift" in the `@jay-framework/wix-forms`
  `docs/01-setup-and-troubleshooting.md`.
- **`BOOKINGS-ADDRESS-UNBOUND`:** add the address markup; or re-run `jay-stack agent-kit` if
  `services.yaml` is stale; or, on a page that only offers address-free services, suppress it with
  `wix-bookings: { allow-unbound-address: true }` in the page's jay-validations block.
- **Italy (and other countries) show region codes, not names:** name them in
  `config/.wix-forms.yaml` `address.labels.subdivisions` (wix-forms setup guide).

## Phone / validation behaves differently from a `wixForm` page

Expected, not a bug. Booking participant fields are checked with `validateFormSummaryField` (required + simple patterns on the trimmed value). Phones use the same `checkPhone` as `wixForm`: a spaced or dashed number such as `+1 202-555-0123` is sent to `createBooking` as E.164 (`+12025550123`), and a number with no country code is refused ("Please include the country code, starting with +.") unless `defaultPhoneCountry` is set in `config/.wix-forms.yaml`. `HOOK` errors and `onSubmitStart` do not apply to the booking flow. Failures surface as `bookingFailure === VALIDATION`, not per-field `errorRule`.

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

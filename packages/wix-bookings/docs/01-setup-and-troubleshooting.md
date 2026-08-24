# Wix Bookings Plugin — Setup & Troubleshooting

**Package:** `@jay-framework/wix-bookings`

This document captures **Wix dashboard configuration**, **API permission requirements**, and **integration pitfalls** discovered during smoke testing.

---

## Booking flow (server)

```
listServices → listSlots → getFormSummary (wix-forms) → createBooking
  → POST /bookings/v2/bookings
  → POST /ecom/v2/carts
  → POST /ecom/v2/carts/{id}/calculate
  → if total > 0: redirect to Wix hosted checkout
  → else: POST /ecom/v2/carts/{id}/place-order
```

Paid checkout uses **ecom Cart v2** + **Headless redirect session** (not `wix-cart`, which is ecom v1 current-cart).

---

## API key permissions (progressive 403s)

Configure in [Wix API Keys Manager](https://manage.wix.com/account/api-keys). Each step of the flow needs its own permission; Wix returns **403** until the right scope is granted.

| Permission                                            | Needed for                           | Symptom if missing                                              |
| ----------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| **Wix Bookings**                                      | List services, slots, create booking | `403` on `/bookings/v2/services/query` — page shows no services |
| **Wix eCommerce** (Write Carts v2 / Manage eCommerce) | Create cart, calculate, place-order  | `403` on `/ecom/v2/carts` after **Confirm Booking**             |
| **Headless** (redirect sessions)                      | Paid checkout redirect               | `403` on `/headless/v1/redirect-session`                        |

Grant only what you need; for local smoke tests, **All site permissions** is acceptable temporarily.

---

## Headless settings (not API key)

Separate from API key permissions. Configure under **Dashboard → Settings → Development & integrations → Headless Settings → your client** (same `clientId` as `config/.wix.yaml` → `oauthStrategy.clientId`).

| Setting                                 | Purpose                                                                 | Symptom if missing                            |
| --------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| **Allowed redirect domains**            | `postFlowUrl` after hosted checkout (e.g. `http://localhost:3000/book`) | `400` on `POST /headless/v1/redirect-session` |
| **Allowed authorization redirect URIs** | Member login (unrelated to bookings)                                    | OAuth login errors                            |

For local dev, add **`localhost:3000`** under **Allowed redirect domains** (domain only — no `http://`).

The Wix site must be **published** — hosted checkout uses the published site. `get-checkout-url` can return **428 SITE_NOT_PUBLISHED** if not.

---

## Redirect session endpoint (do not confuse with wix-cart)

| Endpoint                                  | Used by                                      | Bookings?                    |
| ----------------------------------------- | -------------------------------------------- | ---------------------------- |
| `POST /headless/v1/redirect-session`      | Bookings plugin                              | ✅ Correct                   |
| `POST /redirects-api/v1/redirect-session` | `@jay-framework/wix-cart` (ecom v1 checkout) | ❌ **404** for bookings flow |

Request body (paid booking):

```json
{
  "ecomCheckout": { "checkoutId": "<cartId>" },
  "callbacks": { "postFlowUrl": "https://your-app.example/book" }
}
```

In ecom Cart v2, **cart ID is the checkout ID** (no separate create-checkout step).

**Fallback:** If redirect-session fails with 400/404, the service falls back to `POST /ecom/v2/carts/{cartId}/get-checkout-url`. That opens Wix checkout but may not return to your `postFlowUrl`.

---

## Implementation pitfalls

| Issue                                        | Cause                                           | Fix                                                                       |
| -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| Browser crash `createRequire is not defined` | Server bundle imported in client                | Use `index.client.ts` for client; dynamic imports in `init.ts`            |
| `listServices` 403 with valid key            | Missing Bookings permission                     | Dashboard: enable Wix Bookings on API key                                 |
| Contract validation failed                   | Arrays as `dataType: array`                     | Use `sub-contract` + `repeated: true`                                     |
| `getService(WIX_CLIENT_SERVICE)` wrong shape | Assumed `{ wixClient }` wrapper                 | Service returns `WixClient` directly                                      |
| Paid checkout 400 on redirect-session        | `postFlowUrl` domain not in Headless allowlist  | Add `localhost:3000` (or deployed domain) to **Allowed redirect domains** |
| Paid checkout 404 on redirect-session        | Wrong path `/redirects-api/v1/redirect-session` | Use `/headless/v1/redirect-session` only                                  |

---

## Verification checklist

### Minimum (done when checkout page loads)

- [ ] Services list on booking page
- [ ] Slot selection and form submit
- [ ] Paid service redirects to Wix hosted checkout

### Recommended before calling the integration "done"

- [ ] **Complete payment** on hosted checkout (test card / Wix test mode) and confirm order in Wix dashboard
- [ ] **Free or pay-in-person service** — confirm `place-order` path shows confirmation without redirect
- [ ] **Return URL** — after checkout, Wix redirects to `postCheckoutUrl`
- [ ] **Deployed dev site** — repeat paid flow on production domain (localhost round-trip is best-effort)

### Do not assume success from redirect alone

`postFlowUrl` fires when the user **finishes or abandons** checkout. Do not show "Booking confirmed!" solely because they returned to the page. For production, look up booking/order status.

---

## Config reference

`config/.wix-bookings.yaml`:

| Field                 | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `bookingAppId`        | Wix Bookings app ID on the site                  |
| `staffResourceTypeId` | Resource type for `ANY_RESOURCE` staff selection |
| `slotWindowDays`      | How far ahead to query slots (default 14)        |
| `postCheckoutUrl`     | Relative path after paid checkout (e.g. `/book`) |

See also `agent-kit/plugin/wix-bookings-setup.md` and `wix-bookings-troubleshooting.md`.

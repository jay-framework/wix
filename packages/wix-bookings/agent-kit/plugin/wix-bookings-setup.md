Wix Bookings plugin setup — service list, slot picker, participant form, and checkout.

## What wix-bookings provides

One headless contract and three server actions:

- **booking-flow** — full booking UI (services → slots → form → checkout)
- **listServices** — query available booking services
- **listSlots** — query availability for a selected service
- **createBooking** — create booking, handle paid (redirect) or free (place-order) checkout

## Prerequisites

1. `@jay-framework/wix-server-client` configured (`config/.wix.yaml`)
2. `@jay-framework/wix-forms` for participant field schema (`getFormSummary`)
3. Wix site with Bookings app enabled and published

## Setup steps

### 1. Config file

Running `jay-stack setup wix-bookings` creates `config/.wix-bookings.yaml`:

```yaml
bookingAppId: ""
staffResourceTypeId: ""
slotWindowDays: 14
postCheckoutUrl: "/book"
```

| Field | Purpose |
|-------|---------|
| `bookingAppId` | Wix Bookings app ID on the site |
| `staffResourceTypeId` | Resource type for `ANY_RESOURCE` staff selection |
| `slotWindowDays` | How far ahead to query slots (default 14) |
| `postCheckoutUrl` | Relative path after paid checkout (e.g. `/book`) |

### 2. API key permissions

Configure in [Wix API Keys Manager](https://manage.wix.com/account/api-keys). Each step needs its own permission; Wix returns **403** until the right scope is granted.

| Permission | Needed for | Symptom if missing |
|------------|------------|-------------------|
| **Wix Bookings** | List services, slots, create booking | 403 on `/bookings/v2/services/query` — page shows no services |
| **Wix eCommerce** (Write Carts v2) | Create cart, calculate, place-order | 403 on `/ecom/v2/carts` after Confirm Booking |
| **Headless** (redirect sessions) | Paid checkout redirect | 403 on `/headless/v1/redirect-session` |

Also enable **Wix Forms** on the API key (via `wix-forms` plugin) for participant field schema.

### 3. Headless settings (not API key)

Under **Dashboard → Settings → Development & integrations → Headless Settings → your client** (same `clientId` as `config/.wix.yaml`):

| Setting | Purpose | Symptom if missing |
|---------|---------|-------------------|
| **Allowed redirect domains** | `postFlowUrl` after hosted checkout | 400 on `POST /headless/v1/redirect-session` |
| **Allowed authorization redirect URIs** | Member login (unrelated to bookings) | OAuth login errors |

For local dev, add **`localhost:3000`** under **Allowed redirect domains** (domain only — no `http://`).

The Wix site must be **published** — hosted checkout uses the published site.

### 4. Booking page

```html
<script type="application/jay-headless"
  plugin="@jay-framework/wix-bookings"
  contract="booking-flow"
  key="booking">
</script>

<jay:booking-flow>
  <!-- service list, slot picker, form, checkout UI -->
</jay:booking-flow>
```

## Server flow

```
listServices → listSlots → getFormSummary (wix-forms) → createBooking
  → POST /bookings/v2/bookings
  → POST /ecom/v2/carts
  → POST /ecom/v2/carts/{id}/calculate
  → if total > 0: redirect to Wix hosted checkout
  → else: POST /ecom/v2/carts/{id}/place-order
```

Paid checkout uses **ecom Cart v2** + **Headless redirect session** — not `@jay-framework/wix-cart` (which uses ecom v1).

## Redirect session endpoint

| Endpoint | Used by | Bookings? |
|----------|---------|-----------|
| `POST /headless/v1/redirect-session` | Bookings plugin | Correct |
| `POST /redirects-api/v1/redirect-session` | `@jay-framework/wix-cart` | Wrong — 404 for bookings flow |

Request body (paid booking):

```json
{
  "ecomCheckout": { "checkoutId": "<cartId>" },
  "callbacks": { "postFlowUrl": "https://your-app.example/book" }
}
```

In ecom Cart v2, **cart ID is the checkout ID**.

## Verification checklist

- [ ] Services list on booking page
- [ ] Slot selection and form submit
- [ ] Paid service redirects to Wix hosted checkout
- [ ] Complete payment on hosted checkout and confirm order in Wix dashboard
- [ ] Free or pay-in-person service — confirm place-order path shows confirmation without redirect
- [ ] Return URL — after checkout, Wix redirects to `postCheckoutUrl`

Do not show "Booking confirmed!" solely because the user returned to the page — `postFlowUrl` fires when the user finishes or abandons checkout.

See `wix-bookings-troubleshooting.md` for progressive 403s and implementation pitfalls.

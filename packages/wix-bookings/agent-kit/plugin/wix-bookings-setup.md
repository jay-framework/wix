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
| `bookingAppId` | Wix Bookings app ID on the site (empty = default Wix Bookings app) |
| `staffResourceTypeId` | Site-specific resource **typeId** for staff — required when slot queries use `ANY_RESOURCE` staff selection |
| `slotWindowDays` | How far ahead to query slots (default 14) |
| `postCheckoutUrl` | Relative path after paid checkout (e.g. `/book`) |

#### `staffResourceTypeId` — setup auto-fill

Each Wix site has its own staff resource type. `jay-stack setup wix-bookings` tries to fill an empty value from live Bookings data:

1. `POST /bookings/v1/staff-members/query` — collect each service-provider staff member's `resourceId`
2. `POST /bookings/v2/resources/query` — find a resource in that set and take its `typeId`

`POST /bookings/v2/resources/resource-types/query` is **not** used (it can return an empty list on a fresh site).

| Outcome | What to do |
|---------|------------|
| Setup writes `staffResourceTypeId` | Re-run `jay-stack setup` only when staff or resource types change on the site |
| Setup returns `needs-config` (no staff) | Add at least one staff member in the Wix Bookings dashboard, run setup again, **or** copy a staff resource's `typeId` from `POST /bookings/v2/resources/query` into `config/.wix-bookings.yaml` |
| Value already in YAML | Setup leaves it unchanged (no Wix calls) |

### 2. Agent-kit references (`jay-stack agent-kit`)

After setup and a working API key, run `jay-stack agent-kit` to refresh:

| File | Contents |
|------|----------|
| `agent-kit/references/wix-bookings/services.yaml` | Visible services — `serviceId`, `name`, `type`, `formId`, `dashboardPath` (`bookings/services/form/<id>`) |
| `agent-kit/references/wix-bookings/site.yaml` | `staffResourceTypeId`, staff members (`id`, `resourceId`), config vs discovered type for troubleshooting |

Same pattern as `wix-forms` → `forms.yaml` and `wix-data` → `collections.yaml`: agents resolve **which service** or **which staff resource type** without guessing from page markup alone.

Staff and services are **not** edited in Jay — the index is for discovery and dashboard links. Service field changes stay in the Wix dashboard (see `wix-bookings-dashboard-content.md`).

### 3. API key permissions

Configure in [Wix API Keys Manager](https://manage.wix.com/account/api-keys). Each step needs its own permission; Wix returns **403** until the right scope is granted.

| Permission | Needed for | Symptom if missing |
|------------|------------|-------------------|
| **Wix Bookings** | List services, slots, create booking | 403 on `/bookings/v2/services/query` — page shows no services |
| **Wix eCommerce** (Write Carts v2) | Create cart, calculate, place-order | 403 on `/ecom/v2/carts` after Confirm Booking |
| **Headless** (redirect sessions) | Paid checkout redirect | 403 on `/headless/v1/redirect-session` |

Also enable **Wix Forms** on the API key (via `wix-forms` plugin) for participant field schema.

### 4. Headless settings (not API key)

Under **Dashboard → Settings → Development & integrations → Headless Settings → your client** (same `clientId` as `config/.wix.yaml`):

| Setting | Purpose | Symptom if missing |
|---------|---------|-------------------|
| **Allowed redirect domains** | `postFlowUrl` after hosted checkout | 400 on `POST /headless/v1/redirect-session` |
| **Allowed authorization redirect URIs** | Member login (unrelated to bookings) | OAuth login errors |

For local dev, add **`localhost:3000`** under **Allowed redirect domains** (domain only — no `http://`).

The Wix site must be **published** — hosted checkout uses the published site.

### 5. Booking page

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

## Outcomes — write your own copy

The plugin reports **what happened** through enum variants; the string tags are English **defaults**. For your own wording or another language, branch on the variant and write the text in jay-html. Never detect an outcome by testing or matching a string.

| Variant | Members | Default text in |
| ------- | ------- | --------------- |
| `servicesFailure` | `NONE`, `PERMISSION` (Bookings API 403), `UNKNOWN` | `servicesError` |
| `slotsFailure` | `NONE`, `UNKNOWN` (loading availability failed) | `slotsMessage` |
| `bookingState` | `IDLE`, `BOOKING`, `CONFIRMED`, `FAILED` | `bookingStatus` (on `CONFIRMED`) |
| `bookingFailure` | `NONE`, `VALIDATION`, `FORM_UNAVAILABLE`, `CHECKOUT_PERMISSION`, `CHECKOUT_REDIRECT_REJECTED`, `SITE_NOT_PUBLISHED`, `UNKNOWN` | `bookingError` |

- **No available times** is not a failure: `!hasSlots` with `slotsFailure === NONE` (and `!slotsLoading`).
- `VALIDATION`: the participant form failed a check; `bookingError` names the field (English template, Wix label).
- `CHECKOUT_PERMISSION`, `CHECKOUT_REDIRECT_REJECTED`, `SITE_NOT_PUBLISHED` are **setup** problems (see the troubleshooting guide). Show visitors a neutral line; the default text is a hint for the site owner.

```html
<p if="servicesFailure === PERMISSION">Les réservations sont momentanément indisponibles.</p>
<p if="!slotsLoading && !hasSlots && slotsFailure === NONE">Aucun créneau dans les 14 prochains jours.</p>
<p if="bookingState === CONFIRMED">Réservation confirmée !</p>
<p if="bookingFailure === VALIDATION">Vérifiez vos informations.</p>
<p if="bookingFailure === UNKNOWN">La réservation a échoué. Réessayez.</p>
```

With a page-script import (`key="booking"`), prefix the tags: `booking.bookingState`.

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

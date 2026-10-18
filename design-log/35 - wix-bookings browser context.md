# Design Log 35: wix-bookings in the Browser

## Status

Implemented

## Background

`@jay-framework/wix-bookings` books services through server actions (`booking-flow`, `createBooking`, `listSlots`), which run on a Jay server with the site's API key.

Migrating Classic Wix Bookings sites to Jay produces sites served **without** a Jay server: a static export on Wix-managed headless hosting. There, nothing server-side runs at request time. Wix's own booking widgets work in the browser with the visitor's or member's OAuth token, covering the service list, booking calendar, booking form and the eCommerce thank-you page. The plugin needs the same.

## Problem

In the browser, with the page's OAuth token (visitor, or member after login), a site needs to:

1. Know which booking types the site's **plan** includes. On a plan without them, Wix's widgets stop at "not yet available for online bookings"; courses pass the list and stop at the form.
2. Read the business time zone, look services up by slug and by id, and query time slots as Wix's calendar does.
3. Create the booking: free bookings get placed, paid ones go to Wix's checkout. The site also needs the placed order, to show Wix's thank-you page.
4. Read that order, as its buyer, for the thank-you page, and the visitor's own bookings, for the form's "Book this again?".
5. **Bug:** `createBooking` always sends `resourceSelections` with the configured staff resource type. Unset, it's `''`, and Wix rejects every booking: `resourceTypeId is not a valid GUID`.

## Questions and Answers

**Q: Can visitor tokens do all of this?**
A: Yes, verified against the API: bookings settings, the services query, event time slots, booking creation, carts and place-order. Orders are readable by their buyer only (`ecom/v1/orders/{id}`), and the Bookings Reader returns the caller's own bookings.

**Q: Reuse the server's booking flow or write a browser one?**
A: Reuse it. `createWixBookingsService(wixClient, config)` holds the flow (booking, cart, calculate, then place-order or checkout redirect) and takes any Wix client. The server uses it with the API-key client, the browser with the visitor's client.

**Q: How do the API wrappers run on both sides?**
A: The wix-apis import `wixFetch` from `@jay-framework/wix-server-client/client`, which loads in both environments.

**Q: What does `orderById` return for someone who isn't the buyer?**
A: `undefined`: a `WixApiError` maps to "not your order". The page then shows Wix's thank-you page without an order, as Wix does.

## Design

`WIX_BOOKINGS_CONTEXT` (`lib/contexts/wix-bookings-context.ts`) is registered by the client init on wix-server-client's client:

```ts
interface WixBookingsContext {
    features(): Promise<BookingFeatures>;          // plan: groups, appointments, courses, payments (one settings call)
    timeZone(): Promise<string>;                   // siteProperties.timeZone, the same call
    serviceBySlug(slug: string): Promise<RawBookingService | undefined>;
    serviceById(id: string): Promise<RawBookingService | undefined>;
    timeSlots(query: TimeSlotsQuery): Promise<TimeSlot[]>;     // /_api/service-availability/v2/time-slots/event
    createBooking: WixBookingsService['createBooking'];        // confirmed → { orderId } | redirect → checkout URL
    orderById(orderId: string): Promise<BookingOrder | undefined>;
    serviceBookings(serviceId: string): Promise<{ id?; startDate?; status? }[]>;   // CONFIRMED + PENDING
    bookingById(bookingId: string): Promise<{ id?; startDate?; endDate?; status? } | undefined>;
}
export function canBookOnline(features: BookingFeatures, type: BookingServiceType, step: BookingStep): boolean;
```

- **Service flow:** `createWixBookingsService` moves out of the server service into `lib/services/create-wix-bookings-service.ts`, shared by both sides.
- **Order IDs:** `placeBookingOrder` returns the order id, so `createBooking`'s confirmed outcome is `{ outcome: 'confirmed', orderId? }`.
- **Staff selection fix:** `resourceSelections` is sent only when `staffResourceTypeId` is configured. Otherwise the slot's own resources are booked; a class session names its staff.
- **Config:** `bookingAppId` defaults to the Wix Bookings app id.

## Examples

```ts
const bookings = useGlobalContext(WIX_BOOKINGS_CONTEXT);
if (!canBookOnline(await bookings.features(), service.type, 'calendar')) return showNotAvailableDialog();
const result = await bookings.createBooking({ serviceId, serviceType, slot, formValues, timezone, siteOrigin });
if (result.outcome === 'redirect') location.href = result.redirectUrl;              // Wix checkout
else location.href = `/booking-confirmation?orderId=${result.orderId}`;            // Wix's thank-you page
```

✅ With no `staffResourceTypeId`, a class booking is created: no `resourceSelections` is sent.
❌ Before: `resourceSelections: [{ resourceTypeId: '' }]` was sent, and Wix answered 400.

## Trade-offs

| Decision | Benefit | Cost |
| --- | --- | --- |
| Browser context over the visitor's client | Works without a Jay server, as Wix's widgets do | The plan check runs in the page, as in Wix's own widgets |
| One shared service flow | Server and browser book the same way | Its API wrappers must load in both environments |
| `orderById` maps errors to `undefined` | Non-buyers get Wix's empty thank-you page | A network error looks like "not your order" |

## Verification Criteria

- On a plan without Bookings, a class stops at Wix's dialog; on a premium plan, the same class gets booked.
- A free booking returns its order id, and its buyer reads the order; anyone else gets `undefined`.
- The calendar shows the same open days and times as Wix's for the same service and month.

## Implementation Results

- `packages/wix-bookings`:
  - `lib/contexts/wix-bookings-context.ts`, `lib/services/create-wix-bookings-service.ts`, `lib/init.ts`;
  - the wix-apis now import from `wix-server-client/client`;
  - `place-order.ts` returns `orderId`, and `types.ts` gives `CreateBookingOutcome` the `orderId`.
- Tests: **36/36 passing** (`npx vitest run`) with an English locale.
  - `wix-bookings-context.test.ts` covers features and time zone (one settings call), slug and id lookup, time slots, `orderById` (buyer and non-buyer), `serviceBookings` and `bookingById`.
  - `wix-bookings-service.test.ts` covers the confirmed order id and the staff selection with and without a staff type.
  - `test/format.test.ts` depends on the machine's locale (it expects `Aug`). It fails on a non-English locale before and after this change.
  - `tsc --noEmit` is clean.
- Used end to end on a migrated Wix Bookings site, a static export on a premium plan, as a logged-in member:
  - the monthly calendar with live availability;
  - the booking form with "Book this again?";
  - a free class booked (orders #10002 and #10003);
  - Wix's thank-you page with the order and its calendar link.
- **Deviations:**
  - `orderById`, `serviceBookings` and `bookingById` were added during implementation, for Wix's thank-you page and the booking form's dialog.
  - The staff selection fix was found while booking end to end.

## Review Follow-up

Code review of PR #34 found that `readSettings` cached a *rejected* settings promise: one transient failure of the `bookings-settings` call made every later `features()` and `timeZone()` reject for the page's lifetime, and `timeZone()`'s intended `'UTC'` fallback (`?? 'UTC'`) never ran on a rejection. `readSettings` now catches the failure, resolves to `undefined` (so `features()` reads all-false and `timeZone()` falls back to `'UTC'`), and clears the cache so a later call retries. Covered by a new test in `wix-bookings-context.test.ts` (**37/37 passing**).

Not changed: `orderById`/`ownBookings` map errors to empty results on purpose, so the page fails soft like Wix's own widgets.

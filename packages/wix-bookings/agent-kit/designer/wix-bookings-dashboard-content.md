# wix-bookings — dashboard-managed content

**Plugin** `@jay-framework/wix-bookings` · **contract** `booking-flow`.

Service data (name, tagline, description, price, duration, staff, images) is managed in the **Wix dashboard**. When asked to change it: **Do not edit code.** If you can update the data at its source (a Wix API or tool you have access to), you may do so and say exactly what you changed\; otherwise give the dashboard link below.

## Steps

1. Service id = the inspector `itemId` inside `forEach="services"` (trackBy `id`), or the currently selected service.
2. Call `wix-server-client/getDashboardUrl` with `{ "path": "bookings/services/form/<serviceId>" }`.
3. Reply: "This service is managed in the Wix dashboard: <url>" and name the service.

No service id (e.g. "add a service") → path `bookings/services`.

## Not editable content

Time slots, the selected slot and the participant form state are **live booking-flow state**, not site content. Reply: "This shows live booking availability, not site content; there is nothing to edit here. Change working hours or staff for the service in the dashboard, or the template markup if you meant its look." Use the service URL above when a service is known.

## Not dashboard content

Layout, CSS and markup live in jay-html — edit those normally.

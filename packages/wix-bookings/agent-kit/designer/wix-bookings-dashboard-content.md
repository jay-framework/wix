# wix-bookings — dashboard-managed content

**Plugin** `@jay-framework/wix-bookings` · **contract** `booking-flow`.

Service data (name, tagline, description, price, duration, staff, images) is managed in the **Wix dashboard**. When asked to change it: **do not edit code.** Identify the service with the steps below, then either update it at its source (a Wix API or tool you have access to) and say exactly what you changed, or give its dashboard link. **Never write without a service id from these steps** — a wrong id changes, or sends the site owner to, the wrong service. When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives the services-list link and never writes.

**Mixed requests** (e.g. "rename this service and make the card bigger"): edit the jay-html part normally, and give the dashboard link for the data part.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result**: `file` (the page jay-html), `node` (the clicked element: `lines`, `tag`, `html` — its open tag, attributes and own text) and `stack` — enclosing frames, **innermost → outermost**:

- `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is the value of its `trackBy`.
- `{ kind: 'region', lines, name, props? }` — a `<jay:NAME …>` instance.

All `lines` are 1-based ranges in `file`. The contract is added as a page script — `<script type="application/jay-headless" plugin="@jay-framework/wix-bookings" contract="booking-flow" key="K">` — or as a `<jay:booking-flow>` instance (a `region` frame named `booking-flow`; its lists then appear without the `K.` prefix).

No inspector result → fallback.

## Steps

1. **Find the service id.** Go through the `forEach` frames in `stack`, innermost first; read the element in `file` at the frame's `lines`:

   | `forEach` attribute | `trackBy` | `itemId` is |
   |---------------------|-----------|-------------|
   | `K.services` (or `services` inside a `booking-flow` region) | `id` | service id |

   Use the first match. `slots` and `formFields` frames are **not** services — skip them and keep going outward.
2. **No match** — the click is on the slot picker, the booking form, or the selected service's name (`{K.selectedServiceName}`): there is **no service id** in the inspector result. Don't look one up by name. Use the services-list link and name the service from the visible text.
3. **Build the link** with `wix-server-client/getDashboardUrl`: service → `{ "path": "bookings/services/form/<serviceId>" }`.
4. **Reply:**
   - link: "This service is managed in the Wix dashboard: <url>", naming the service (visible text in `node.html`);
   - write: "Updated <field> on service <name> (id <serviceId>) from <old> to <new>." and add the dashboard link.

## Fallbacks

Give the services-list link — path `bookings/services` — and say you couldn't identify the specific service. Also use it for "add a service".

Fall back when: there is no inspector result; no `services` frame matches; or its `trackBy` isn't `id`.

If `wix-server-client/getDashboardUrl` itself fails, give no link: say services are managed in the Wix dashboard (Booking Services) and that you couldn't build the link.

## Not editable content

Time slots, the selected slot and the participant form state are **live booking-flow state**, not site content. Edit no code and no data, and reply: "This shows live booking availability, not site content; there is nothing to edit here. Change working hours or staff for the service in the dashboard, or the template markup if you meant its look." Add the service link if step 1 found an id, otherwise the services-list link.

## Not dashboard content

Layout, CSS and markup live in jay-html — edit those normally.

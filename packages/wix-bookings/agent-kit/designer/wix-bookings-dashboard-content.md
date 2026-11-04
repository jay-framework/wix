# wix-bookings — dashboard-managed content

**Plugin** `@jay-framework/wix-bookings` · **contract** `booking-flow`.

Service data (name, tagline, description, price, duration, staff, images) is managed in the **Wix dashboard**. When asked to change it: **do not edit code.** Identify the service with the steps below. **Never write without a service id from these steps** — a wrong id changes, or sends the site owner to, the wrong service. When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives the services-list link and never writes.

**Mixed requests** (e.g. "rename this service and make the card bigger"): edit the jay-html part normally, and handle the service data part with the steps below.

## Agent behavior

### Reply style

Keep replies to the site owner **short and simple** (about 1–3 sentences). They are often non-technical — use everyday words and a visual or business angle. Say **what** changed or **where** they can change the service in Wix. Do **not** put file paths, code, binding syntax, or service ids in the thread reply (use ids only in tools and in the steps below).

### Update data or send a link

- **Try to update** the service when you are **confident** you have the right service id (step 1), the request is **unambiguous**, and you have a **Wix API or tool** that can apply the change. After a successful update, confirm in plain language and include the dashboard link from step 3 so they can review.
- If you are **not** confident, the request is **ambiguous**, or you **lack** a working update tool → **do not write**. Build the dashboard link when you can and tell them where to edit the service in Wix.
- If an update **fails** → say so briefly and give the dashboard link.

Do not hard-code service fields into jay-html.

### Ambiguity and area markers

A screenshot may show **several services** inside one **area marker**, but inspect returns **one** `Target source` (one element, at most **one** service id from step 1).

When you are unsure — several services visible, the comment does not name which one, “change these” without naming each, or the resolved id may not match what they meant — **do not write**. Explain briefly what you see, which service (if any) the mark resolved to, and **ask them to clarify** (name the service, say “both”, or mark one service at a time). Use the [services list](#fallbacks) when several services might be in scope; use a single-service link only when step 1 gave one clear id. Do not look up a service id by name alone (step 2).

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
3. **Build the link** with `wix-server-client/getDashboardUrl`: service → `{ "path": "bookings/services/form/<serviceId>" }`. Run from the project root: `npx jay-stack-cli action wix-server-client/getDashboardUrl --input '{"path":"bookings/services/form/<serviceId>"}'`; the output's `url` is the link. Never read `config/.wix.yaml` or other credential files to build it.
4. **Reply** (see [Agent behavior](#agent-behavior)): plain language only — e.g. “This service is set up in your Wix Bookings dashboard; you can change the name here: <url>” or “I updated the service name to …; you can review it here: <url>”.

## Fallbacks

Give the services-list link — path `bookings/services` — and say you couldn't identify the specific service. Also use it for "add a service".

Fall back when: there is no inspector result; no `services` frame matches; or its `trackBy` isn't `id`.

If `wix-server-client/getDashboardUrl` itself fails, give no link: say services are managed in the Wix dashboard (Booking Services) and that you couldn't build the link.

## Not editable content

Time slots, the selected slot and the participant form state are **live booking-flow state**, not site content. Edit no code and no data. Reply in plain language that this is live availability, not something you can edit on the page — suggest changing hours or staff in Bookings, or the page design in the template if they meant how it looks. Add the service link if step 1 found an id, otherwise the services-list link.

## Not dashboard content

Layout, CSS and markup live in jay-html — edit those normally.

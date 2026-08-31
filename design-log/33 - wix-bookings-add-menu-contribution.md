# Design Log #33 — wix-bookings Add Menu contribution

## Status

**Draft — architect scoping (2026-08-31)**

**Parent:** [jay-aiditor #19](../../jay-aiditor/design-log/19%20-%20aiditor-add-menu.md). **Prerequisite plugin:** `@jay-framework/wix-forms` (participant schema). **Reference:** [wix-stores Add Menu #24](./20%20-%20wix-stores-add-menu-contribution.md).

## Background

`@jay-framework/wix-bookings` exposes one headless contract **`booking-flow`** — full UI for service list → slots → participant form → checkout. Setup requires `config/.wix-bookings.yaml` (`bookingAppId`, `staffResourceTypeId`, etc.) and **wix-forms** installed.

There is no Add Menu contributor; users adding a `/book` page cannot discover booking-flow from AIditor.

## Problem

1. No Add Menu entry for **booking-flow** component.
2. Agents lack **site-specific booking context** — app id, post-checkout URL, service names (optional generated items).
3. **Dependency chain** is opaque in AIditor — bookings needs wix-server-client + wix-forms configured.
4. **Settings** — bookings config is yaml-only; onboarding for API permissions (Bookings, eCommerce, Headless redirects) fits #33 settings tab pattern.

## Questions and Answers

**Q: Static vs generated Add Menu items?**
**A:** **Both**, mirroring wix-stores:
- **Static** (`wix-bookings.yaml` on setup): one **Booking flow** component item (`booking-flow` contract).
- **Generated** (`wix-bookings.generated.yaml` on agent-kit): one item per **bookable service** from `listServices` — id, name, duration, price label, `formId` — for “add service X booking section” prompts. Category `Bookings`, subCategory `Services`.

**Q: Materialized contract for booking-flow?**
**A:** **No** — single static contract in package (`booking-flow.jay-contract`). Unlike forms, flow shape is fixed; services are data, not separate contracts.

**Q: Project settings tab?**
**A:** **Recommended v1** — high permission surface (Bookings + eCommerce + Headless redirects). Tab shows checklist from `wix-bookings-setup.md`, read-only config summary (no API keys), dependency status for wix-forms + wix-server-client, link to Wix Dashboard.

**Q: Q8 route params?**
**A:** **N/A** — `booking-flow` has no URL `params:` in contract. Add Page route is a normal static path (e.g. `/book`).

## Design

### Static add-menu template (`add-menu.template.yaml`)

One item:

| Field | Value |
| ----- | ----- |
| `id` | `wix-bookings:booking-flow` |
| `title` | Booking flow |
| `category` | Bookings |
| `subCategory` | Components |
| `prompt` | contract `booking-flow`, script key `booking`, read `node_modules/.../booking-flow.jay-contract`, `postCheckoutUrl` from config |

`interaction.mode`: `stage-place`.

### Generated services (`wix-bookings.generated.yaml`)

Per service from live API:

- `id`: `wix-bookings:service:{serviceId}`
- `title`: service name
- `prompt`: service id, formId, price/duration labels, hint to use booking-flow or embed service-specific CTA

### Setup

- `setupWixBookings`: copy static template → `wix-bookings.yaml` (idempotent, `ctx.force`).
- Validate wix-forms service present (existing).

### agentkit handler (new)

- Query services via `WixBookingsService` / `listServices`.
- Write `wix-bookings.generated.yaml`.
- Optionally refresh `agent-kit/references/wix-bookings/services.yaml` for agent discovery (parallel to wix-data collections.yaml).

### Settings tab

- `settings.template.yaml` → `agent-kit/aiditor/settings/wix-bookings.yaml`
- Route `/wix-bookings/settings` (`devOnly: true`)
- Permission checklist + dependency matrix + config file path hints

### Blast radius

| Package | Change |
| ------- | ------ |
| wix-bookings | setup writer, agentkit handler, optional settings page, plugin.yaml `agentkit` |
| wix-forms | None (dependency only) |
| jay-aiditor | None — catalog consumption only |

## Implementation Plan

| ID | Task | Priority |
| -- | ---- | -------- |
| B1 | Static add-menu template + setup writer | P0 |
| B2 | agentkit: services → generated yaml | P1 |
| B3 | Tests (shape, no aiditor import) | P0 |
| B4 | Settings tab + troubleshooting iframe | P1 |

## Trade-offs

- **Service-level generated items** — extra API call at agent-kit; high value for “book a haircut” prompts.
- **No per-service contracts** — avoids combinatorial explosion; booking-flow remains single entry point.

## Verification Criteria

- [ ] `jay-stack setup wix-bookings` → `wix-bookings.yaml` with booking-flow item
- [ ] `jay-stack agent-kit` with live site → `wix-bookings.generated.yaml` with ≥1 service
- [ ] Add Menu attach → prompt references booking-flow contract + config paths
- [ ] Setup fails clearly when wix-forms missing
- [ ] Settings tab shows permission checklist (if B4 shipped)

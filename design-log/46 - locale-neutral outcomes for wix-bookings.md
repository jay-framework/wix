# 46 - Locale-Neutral Outcomes for wix-bookings

Status: Implemented (2026-11-08)

Applies DL#45's rule (outcomes are variants, text is a default) to the `booking-flow` contract. Paths are relative to `packages/wix-bookings/lib/` unless stated.

## Decisions for the Implementer (TL;DR)

- **Four new enum variants on `contracts/booking-flow.jay-contract`:**
  - `servicesFailure: enum (NONE | PERMISSION | UNKNOWN)`
  - `slotsFailure: enum (NONE | UNKNOWN)`
  - `bookingState: enum (IDLE | BOOKING | CONFIRMED | FAILED)`
  - `bookingFailure: enum (NONE | VALIDATION | FORM_UNAVAILABLE | CHECKOUT_PERMISSION | CHECKOUT_REDIRECT_REJECTED | SITE_NOT_PUBLISHED | UNKNOWN)`
- **Every existing string tag stays** (`servicesError`, `slotsMessage`, `bookingStatus`, `bookingError`) as English default copy, so existing pages keep working.
- **One pure module, `utils/booking-outcome.ts`,** classifies errors into `{ failure, message }` and derives `bookingState`. The component's inline string-matching moves there unchanged, so the codes and the default messages can't disagree.
- **Enums come from the compiled contract** (`../contracts/booking-flow.jay-contract`), as wix-stores does: the contract is static here, so there is no mirror enum.
- **jay-feedback:** agent-kit only (`wix-bookings-setup.md` §Outcomes); no validation (DL#45 reasoning).

## Background

`components/booking-flow.ts` reports each outcome only as English text: `servicesError` (with a 403 special case), `slotsMessage` (an error _or_ "No available times…"), `bookingError` (client validation, participant-form load failure, three checkout setup errors detected by matching the error text), and `bookingStatus = 'Booking confirmed!'`. A page can't localize or redesign any of these without matching English.

## Design

| Variant           | Member                       | When (today's default text)                                                                       |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `servicesFailure` | `PERMISSION`                 | listing services failed with a 403 ("Bookings API access denied…")                                |
|                   | `UNKNOWN`                    | any other listing failure                                                                         |
| `slotsFailure`    | `UNKNOWN`                    | loading availability threw. "No times" is not a failure: `!hasSlots` with `slotsFailure === NONE` |
| `bookingFailure`  | `VALIDATION`                 | a participant field failed `validateFormSummaryField`                                             |
|                   | `FORM_UNAVAILABLE`           | `getFormSummary` failed                                                                           |
|                   | `CHECKOUT_PERMISSION`        | `/ecom/v2/carts` + 403                                                                            |
|                   | `CHECKOUT_REDIRECT_REJECTED` | `redirect-session` + 400                                                                          |
|                   | `SITE_NOT_PUBLISHED`         | `get-checkout-url`                                                                                |
|                   | `UNKNOWN`                    | any other `createBooking` failure                                                                 |

`bookingState`: `FAILED` if `bookingFailure ≠ NONE`, else `BOOKING` while `isBooking`, else `CONFIRMED` once confirmed, else `IDLE`. Selecting a service or slot, or going back, resets to `IDLE`.

```html
<p if="flow.bookingState === CONFIRMED">Réservation confirmée !</p>
<p if="flow.bookingFailure === VALIDATION">{flow.bookingError}</p>
<p if="flow.servicesFailure === PERMISSION">Service indisponible.</p>
```

## Trade-offs

- **Setup errors as codes** (`CHECKOUT_PERMISSION`, `SITE_NOT_PUBLISHED`, …) are aimed at the site owner, not visitors. They're still codes, so a page can show a visitor-friendly line and keep the English hint for development.
- **Error detection stays string-based** (Wix's error text), as it was. Moving it to structured errors is a separate change.

## Agent Feedback Loop

Agent-kit: yes. Validation: no.

## Implementation Results

Implemented as designed. Tests: wix-bookings 49/49 (12 new in `test/booking-outcome.test.ts`). `yarn build` (with `validate-plugin`) and `tsc` green.

- **Contract import:** value imports of the contract enums use the extensionless `'../contracts/booking-flow.jay-contract'` (as wix-stores does). The old `.js` suffix only worked because the import was type-only.
- **Default text unchanged:** the error classification moved from the component to `utils/booking-outcome.ts` with the same strings and the same matching.
- `renderFastChanging` now passes the slow carry-forward through whole (it gained `servicesFailure`).
- **Not verified in a browser:** no example page binds `booking-flow`.

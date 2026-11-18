# wix-forms backlog

Deferred follow-ups. None is scheduled: start an item **when a site needs it** (its trigger below).
Each needs its own design log before code. Sizes are rough: S = days, M = about a week, L = more.

## P3 — form-level and disabled-form messages

- **Problem:** Wix errors without a field key are dropped and the visitor sees generic text: owner
  custom validations that name no field, and `DISABLED_FORM_ERROR` (a disabled form).
- **Affected:** sites whose form owners add form-level custom validations or disable a form.
- **Evidence:** DL #55 §Follow-ups (P3) and §Backward compatibility. The length / pattern mapping
  rows also wait for this capture.
- **Needs:** live checks set up by the product owner (a custom validation with and without a field
  key, plus `minLength` / `maxLength` / `pattern`; a disabled QA form).
- **Start when:** a site reports a generic message where Wix had a specific one, or needs to show a
  disabled form's message.
- **Size:** M.

## P5b — number fields submit numbers

- **Problem:** Number and Rating fields are not posted as numbers.
- **Affected:** sites whose forms have Number or Rating fields.
- **Evidence:** DL #55 §Follow-ups (P5b).
- **Needs:** a QA form with Number and Rating fields.
- **Start when:** a site's form has a Number or Rating field it must submit.
- **Size:** S–M.

## P5a (remainder) — schema warnings at generation time

- **Problem:** some form schemas are generated without a warning although the plugin cannot honour
  them: `formRules` (conditional logic), `readOnly`, and input types that are posted as text. P1c's
  `PHONE_COUNTRY`-style warning for other rules (for example `EMAIL` / `URL` from server mapping)
  also belongs here.
- **Already covered (DL #51):** unsupported fields are left out with a generation warning (a
  required one sets `loadError`), required untargeted fields warn, and the row-14 kinds no longer
  render as text.
- **Affected:** sites whose forms use conditional rules, read-only fields, or uncommon input types.
- **Evidence:** DL #55 §Follow-ups (P5a) and §1c (phone-only warning note); DL #51 Problem 4.
- **Start when:** a site's form uses one of these and an agent or designer builds it without notice.
- **Size:** S–M.

## wix-forms client packaging

- **Problem:** any page that loads the wix-forms client pays for libphonenumber-js (about 29 KB gz)
  and the unused `wixForm` component, including pages without a form such as booking flows.
- **Affected:** every site using wix-forms or wix-bookings; page weight only.
- **Evidence:** DL #55 TL;DR (Library), Implementation Plan "Bundle cost", §Follow-ups. Earlier
  attempts hit two blockers (nested `dist/node_modules` dropped by `yarn pack`; a preserved
  `-actions` module misread by the jay-stack compiler).
- **Start when:** a site's bundle size or performance budget for a form-less page is a concern.
- **Size:** M.

## Replace the public `getFormSummary` schema read

- **Problem:** `getFormSummary` is a public query that returns the field schema of any form id on
  the site, one Wix call per anonymous request (accepted residual risk).
- **Plan:** replace it with a wix-bookings server query that resolves the form from the service id,
  then deprecate the public query. Being planned separately.
- **Affected:** sites with booking flows.
- **Evidence:** DL #47 §Accepted residual risks (risk 3); DL #49 §4 (tracked follow-up).
- **Start when:** the separate plan is ready, or a site needs the schema read closed.
- **Size:** M.

## Screen readers other than VoiceOver

- **Problem:** blur-found error announcements through `statusMessage` were tested only on macOS
  VoiceOver + Safari. NVDA, JAWS and TalkBack are untested.
- **Context:** on VoiceOver, leaving the same invalid field again re-reads the error in 7 of 11
  tries; the misses were accepted as a polite-announcement limitation.
- **Affected:** visitors on Windows or Android screen readers.
- **Evidence:** DL #59 (Phase 0 results; VoiceOver re-listen results; "Automated VoiceOver runs").
- **Recommended first step:** an NVDA + Firefox / Chrome check (cheap).
- **Start when:** a site has a Windows or Android accessibility requirement, or before claiming
  screen-reader support beyond VoiceOver.
- **Size:** S (NVDA), M (all three).

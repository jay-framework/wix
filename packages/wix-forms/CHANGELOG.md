# Changelog — @jay-framework/wix-forms

## Unreleased

### Behaviour changes (read before upgrading)

1. **⚠️ Blur no longer flags untouched fields.**
   - **Before:** tabbing past an empty required field showed its error immediately, so tabbing
     through an empty form painted every field red before the user typed anything.
   - **After:** a field shows an error on blur only if the user changed it, or if it already shows
     an error. Every visible field is still validated at submit, and focus moves to the first
     invalid one.
   - **Why:** no errors before the user has typed (standard form practice).
   - There is no config switch.
2. **Typing clears an error only when the value is valid.** Typing in a field that shows an error
   re-checks it and clears the error as soon as the value passes. While the value is still invalid,
   the existing message stays (it is not replaced on every keystroke). Server (`SERVER`) errors
   also clear once the client rules pass; the next submit asks the server again.
3. **Hidden and `control` values follow the page** while the user has not edited the field: they are
   seeded after mount, at every submit (so a retry after a failed submit sends the page's current
   value), and after "send another" (a bug fix: a second submit used to resend
   the first value, and after a reset hidden fields were sent empty). A bound control with
   `data-value=""` now clears its value. Custom widgets must render `data-value`.
   A change to a control's `data-value` also shows in the field's visible input right away, so the
   input never shows one value while another is sent; a value the user typed is kept.
4. **A redirecting form no longer flashes its confirmation** before navigating. The form stays busy
   (`submitState: SUBMITTING`) until the page unloads.
5. **Server honeypot.** A direct `submitForm` post with a non-empty `honeypot` input is dropped (fake
   success, no Wix call) when the form has no submit hook. This catches callers that fill every
   action input; it does not stop replays of the plugin's own requests (they carry no `honeypot`).
   Hooks receive `honeypot` and decide. In the browser nothing changes: a filled in-page honeypot
   still makes no request.
6. **Browser Email and URL rules for form fields are never stricter than Wix.** URL accepts any
   `scheme://` in any case (`HTTPS://…`, `ftp://…`) without whitespace. Values only Wix refuses
   (e.g. `a@b.c`) are refused after submit. Phones follow change 8. The bookings participant
   check (`validateFormSummaryField`) is unchanged.
7. **Wix field errors use `errorRule` `EMAIL` / `PHONE` / `URL` and the default text.** A format
   error Wix refuses after submit now shows the same rule and English default text as the browser
   check, instead of `SERVER` with Wix's validator text. `SERVER` now means an unclassified Wix
   refusal or the site owner's custom message (and a submit hook's `FieldRejection`). A page that
   printed `error` only under `SERVER` should add `EMAIL` / `PHONE` / `URL` branches or print `error`
   unconditionally. `fieldErrors` keeps Wix's text.
8. **Phones are sent as compact international numbers (E.164).** Wix accepts only that shape from
   visitors, so the plugin converts what the visitor typed (`+972-54-123-4567`, `00972…`, or a local
   number with a known country) to `+972541234567` before submitting. The input and the
   confirmation keep what was typed; a submit hook sees the E.164 value, so a hook that matched
   local formats must accept E.164. Stored phones become E.164.
9. **A phone without a country code is refused in the browser with `errorRule` `PHONE_COUNTRY`**
   ("Please include the country code, starting with +.") unless `defaultPhoneCountry` in
   `config/.wix-forms.yaml` supplies a country. Values the plugin cannot send as an international
   number (`12`, `.`, `---`, `+`) are refused as `PHONE`. Pages that show a phone error only under
   `errorRule === PHONE` should add a `PHONE_COUNTRY` branch or print `error` unconditionally
   (`jay-stack validate` warns). The exported `checkFormField` / `validateFormField` refuse such
   phones and may return `PHONE_COUNTRY`. Every page that loads the wix-forms client (bookings pages
   included) grows by about 29 KB gzipped for the phone library.

### API additions (all optional / additive)

- `FieldRule.PHONE_COUNTRY` (appended after `SERVER`; existing values unchanged) and config key
  `defaultPhoneCountry` (ISO 3166-1 alpha-2; an unsupported value fails init).
- New runtime dependency `libphonenumber-js` (the server build imports it, so it is installed on
  every site using wix-forms).
- `submitForm` output `fieldRules` (target → `FieldRule` index) for server field errors the plugin
  classifies; absent targets are `SERVER`.
- Per-field contract variant `errorRule` (`NONE | REQUIRED | MIN_LENGTH | MAX_LENGTH | EMAIL | PHONE
| URL | PATTERN | CUSTOM | SERVER | PHONE_COUNTRY`) and the `FieldRule` enum, so pages write their own wording per
  rule. Regenerate contracts to bind it.
- Client context `WIX_FORMS_CONTEXT` (`@jay-framework/wix-forms/client`):
  `registerFieldChecks(formId, checks)` for page-owned rules (reported as `CUSTOM`), and the
  `onSubmitOutcome(handler)` (`SubmitOutcomeEvent`) for page code; it returns an unsubscribe
  function (subscribe in `createEffect` so unmount removes the handler).
- `FieldRejection(fieldErrors, { code? })`: thrown by a submit hook before `submit()` to reject
  specific fields (`submitFailure: VALIDATION`, fields marked `SERVER`).
- `submitForm` result: optional `code` (the hook's `ActionError` / `FieldRejection` code).
- `submitForm` input: optional `honeypot` (the plugin component never sends it).
- `SubmitHookInput.honeypot` and `SubmitHookOutcome.dropped` (`return { dropped: true }` settles as a
  success without posting).
- `checkFormField(field, value)` returns `{ rule, message }`; `validateFormField` is unchanged.

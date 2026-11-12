# Changelog — @jay-framework/wix-forms

## 0.26.4

### Behaviour changes (read before upgrading)

1. **Browser Email and URL rules for form fields are never stricter than Wix.** URL accepts any
   `scheme://` in any case (`HTTPS://…`, `ftp://…`) without whitespace. Values only Wix refuses
   (e.g. `a@b.c`) are refused after submit. Phones follow change 3. The bookings participant
   check (`validateFormSummaryField`) is unchanged.
2. **Wix field errors use `errorRule` `EMAIL` / `PHONE` / `URL` and the default text.** A format
   error Wix refuses after submit now shows the same rule and English default text as the browser
   check, instead of `SERVER` with Wix's validator text. `SERVER` now means an unclassified Wix
   refusal or the site owner's custom message (a submit hook's `FieldRejection` is `HOOK`, change
   6). A page that
   printed `error` only under `SERVER` should add `EMAIL` / `PHONE` / `URL` branches or print `error`
   unconditionally. `fieldErrors` keeps Wix's text.
3. **Phones are sent as compact international numbers (E.164).** Wix accepts only that shape from
   visitors, so the plugin converts what the visitor typed (`+972-54-123-4567`, `00972…`, or a local
   number with a known country) to `+972541234567` before submitting, after trimming (change 5).
   The input and the confirmation keep what was typed (trimmed); a submit hook sees the E.164 value, so a hook that matched
   local formats must accept E.164. Stored phones become E.164.
4. **A phone without a country code is refused in the browser with `errorRule` `PHONE_COUNTRY`**
   ("Please include the country code, starting with +.") unless `defaultPhoneCountry` in
   `config/.wix-forms.yaml` supplies a country. Values the plugin cannot send as an international
   number (`12`, `.`, `---`, `+`) are refused as `PHONE`. Pages that show a phone error only under
   `errorRule === PHONE` should add a `PHONE_COUNTRY` branch or print `error` unconditionally
   (`jay-stack validate` warns). The exported `checkFormField` / `validateFormField` refuse such
   phones and may return `PHONE_COUNTRY`. Every page that loads the wix-forms client (bookings pages
   included) grows by about 29 KB gzipped for the phone library.

5. **Text values are trimmed** before sending and in the confirmation echo (visible `text`,
   `textarea`, `email`, `tel`, `url`; hidden, `select`, checkbox and multiselect values unchanged).
   - **Before:** `"Ann "` was stored by Wix and shown as "Thank you, Ann .".
   - **After:** `Ann` is stored and shown. Page checks also receive the trimmed value on blur,
     typing and submit. A `textarea` loses leading/trailing newlines (inner whitespace is kept).
     A phone is trimmed first, then sent as E.164 (change 3).
   - **Why:** validation already ignored the spaces, so the stored value now matches what was
     validated. Direct `submitForm` posts that bypass the component are not trimmed.
6. **⚠️ Hook field errors are `errorRule: HOOK`**; Wix's own refusals stay `SERVER` (or the rule
   of change 2).
   - **Before:** a submit hook's `FieldRejection` marked its fields `SERVER`, like a Wix refusal.
   - **After:** they are `HOOK`. `invalid` and `error` are unchanged, so markup that prints
     `{field.error}` without branching keeps working. Regenerate contracts.

   ```html
   <!-- before: hook text shown only under SERVER -->
   <span if="booking.firstName.errorRule === SERVER">{booking.firstName.error}</span>
   <!-- after -->
   <span if="booking.firstName.errorRule === HOOK">{booking.firstName.error}</span>
   <span if="booking.firstName.errorRule === SERVER">We could not accept this value.</span>
   ```

7. **`submitState: SUBMITTING` starts when the request is sent**, not at the click, so "Sending…"
   no longer flashes on a client-validation stop (as in 0.26.1). `isSubmitting` is unchanged
   (keep `disabled` on it).
8. **A throwing `onSubmitOutcome` handler no longer skips the other handlers.** Each handler runs
   in its own `try`; a throw is logged.
9. **Wix's "country not allowed" phone refusal is `errorRule: PHONE`** with the default text
   ("Please enter a valid phone number."). Wix sends it (`NOT_ALLOWED_VALUE_ERROR`) for a country
   outside the field's accepted list or an unassigned number; it was `SERVER` with Wix's text.
   `fieldErrors` keeps Wix's text.

### API additions (all optional / additive)

- `FieldRule.PHONE_COUNTRY` (appended after `SERVER`; existing values unchanged) and config key
  `defaultPhoneCountry` (ISO 3166-1 alpha-2; an unsupported value fails init).
- New runtime dependency `libphonenumber-js` (the server build imports it, so it is installed on
  every site using wix-forms).
- `submitForm` output `fieldRules` (target → `FieldRule` index) for server field errors the plugin
  classifies; absent targets are `SERVER`.
- `FieldRule.HOOK` (appended after `PHONE_COUNTRY`: `SERVER = 9`, `PHONE_COUNTRY = 10`,
  `HOOK = 11`; existing values unchanged).
- `fromHook?: boolean` on the `submitForm` result / action output and on the `failed`
  `SubmitOutcomeEvent`.
- `WIX_FORMS_CONTEXT.onSubmitStart(handler)` (returns an unsubscribe), with `SubmitStartEvent` and
  `SubmitStartHandler`.

### Migration checklist

- [ ] Regenerate form contracts (the `errorRule` enum gains `PHONE_COUNTRY` and `HOOK`).
- [ ] Phone fields: branch on `PHONE` and `PHONE_COUNTRY`, or print `{field.error}`
      unconditionally; set `defaultPhoneCountry` if visitors type local numbers.
- [ ] Pages whose form has a submit hook that throws `FieldRejection`: add a `HOOK` branch next to
      `SERVER` (otherwise those fields turn red with no text).
- [ ] Submit hooks that match local phone formats: accept E.164.

## 0.26.3

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

### API additions (all optional / additive)

- Per-field contract variant `errorRule` (`NONE | REQUIRED | MIN_LENGTH | MAX_LENGTH | EMAIL | PHONE
| URL | PATTERN | CUSTOM | SERVER`) and the `FieldRule` enum, so pages write their own wording per
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

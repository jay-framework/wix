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

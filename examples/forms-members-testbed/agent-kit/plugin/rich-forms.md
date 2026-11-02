Rich production forms with wix-forms (DL#39).

Builds on the per-form contracts (DL#38 — see `per-form-contracts.md`). Every form's
contract already carries the tags below; a page uses only the ones it binds, and any it
ignores are inert. Everything is driven by one per-field **value store** inside the shared
`wixForm` component — the single source of truth for each field's current value.

## 1. Confirmation / sent state (+ personalized echo)

After a successful submit, `isSubmitted` becomes `true` and stays true until reset. Swap the
form for a thank-you panel with `if`/`if="!"`. The store is NOT cleared on submit, so the
confirmation can echo what was entered via each field's `value`. A `resetButton` clears the
store and returns to a blank form (`isSubmitted=false`).

```html
<form if="!contact.isSubmitted">
  <label>{contact.email.label}
    <input ref="contact.email.input" aria-invalid="{contact.email.invalid}"
           placeholder="{contact.email.placeholder}" />
    <span role="alert" aria-live="polite" class="error" if="contact.email.error">{contact.email.error}</span>
  </label>
  <button ref="contact.submitButton">Send</button>
  <p if="contact.statusMessage">{contact.statusMessage}</p>
</form>

<section if="contact.isSubmitted" role="status">
  <h2>Thanks, {contact.firstName.value}!</h2>
  <p>We'll reply to {contact.email.value} shortly.</p>
  <button ref="contact.resetButton">Send another</button>
</section>
```

Do **not** gate the confirmation on `statusMessage` — it is a data tag that also carries
submit errors. Use the `isSubmitted` variant. Note: a confirmation shown after a honeypot
trip (below) does NOT imply the submission was stored — never treat "confirmation shown" as
a persistence guarantee.

**Submit/reset buttons and native form submission.** A `<button>` inside a `<form>`
defaults to `type=submit`, so a click (or Enter in a field) triggers the browser's own form
submission — a page navigation that reloads before the plugin's async submit can run. The
`wixForm` component prevents this for you (it cancels the default on the button clicks and
guards the owning `<form>`), so the markup above works as written. As defense-in-depth it is
still good practice to make the intent explicit:

```html
<button type="button" ref="contact.submitButton">Send</button>
...
<button type="button" ref="contact.resetButton">Send another</button>
```

## 2. Prefill

Two sources seed the store, last-wins, each field independently:

- **Page-provided default** — bind a value the page already has (route param, query, page
  data) through a hidden `control`:
  `<input type="hidden" ref="contact.email.control" data-value="{defaultEmail}" />`.
- **Signed-in member** — opt-in config in `config/.wix-forms.yaml`, mapping a field target to
  a Wix member dot-path. The plugin cannot guess which field is "the email", so this is
  required:

  ```yaml
  memberPrefill:
    email: loginEmail
    firstName: profile.firstName
  ```

  Member identity is read client-side from `GET /members/v1/members/my` (interactive phase —
  Q4 default; member-aware SSR is a possible later optimization). Member prefill is async and
  **never overwrites a field the user already edited**. A `memberPrefill` target that is not a
  field of a form on the page is flagged by the validator.

## 3. Live validation

The plugin validates on `input`/`blur` (not only on submit) using the Wix field schema
(required + email/tel/url format + min/max/pattern) — nothing to configure. Bind the
accessible pattern: `aria-invalid="{contact.email.invalid}"` on the input and the `error` in
a `role="alert" aria-live="polite"` live region (see example above). The `invalid` variant
also drives error styling.

## 4a. Hidden values + honeypot spam protection

- **Hidden page values** reuse the `control` channel on a Wix hidden field — one hidden input
  populates it and it reaches the submission:
  `<input type="hidden" ref="contact.propertyId.control" data-value="{propertyId}" />`.
- **Honeypot** — bind a visually-hidden input to the reserved `honeypot` tag. A real user
  never fills it; a bot that auto-fills every input trips it and the submit is silently
  aborted (no `createSubmission`) while still showing the confirmation, so the bot cannot
  tell:

  ```html
  <input ref="contact.honeypot" type="text" tabindex="-1" autocomplete="off"
         aria-hidden="true" style="position:absolute;left:-9999px" />
  ```

## 4b. Server-side submit hook (optional)

Register **one hook per form** when the server must act around the submission: verify who is
submitting, re-check availability, write your own record, add server-derived values (often into
a hidden field), redirect to a confirmation page. Forms without a hook submit the browser values unchanged (see "Who the submission posts as" below).

**Register it inside `makeJayInit().withServer(...)`, never at the top level.** The project's
`src/init.ts` is loaded into the browser, and only `.withServer(...)` is stripped from the client
build, so a top-level `registerService` ships the hook (and everything it imports) to the browser.

```ts
// src/init.ts
import { makeJayInit, ActionError } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { WIX_FORMS_SUBMIT_HOOKS } from '@jay-framework/wix-forms';

export const init = makeJayInit().withServer(async () => {
  registerService(WIX_FORMS_SUBMIT_HOOKS, {
    [REQUEST_VISIT_FORM_ID]: async ({ values, caller, submit }) => {
      if (caller?.type !== 'MEMBER')                                  // a VISITOR proves a session only
        throw new ActionError('SIGN_IN_REQUIRED', 'Please sign in again to request a visit.');
      const slot = parseSlot(values);                                 // values are UNTRUSTED: re-validate
      const reservation = (await reservations.findOwn(caller.id, slot))   // a retry reuses it
        ?? (await reservations.createIfFree({ ownerId: caller.id, slot }));
      if (!reservation) throw new ActionError('SLOT_TAKEN', 'That time was just taken. Please pick another.');
      try {
        await submit({ ...values, reference: reservation.reference }); // hidden, required field
      } catch (error) {
        await reservations.remove(reservation.id);                    // compensate
        throw error;                                                  // or swallow it: same result
      }
      return { redirectTo: `/visit/confirmed?ref=${encodeURIComponent(reservation.reference)}` };
    },
  });
  return {};
});
```

The form id is the key in `agent-kit/plugins-index.yaml` / the generated `forms.yaml`. The hook
receives `{ formId, values, caller, client, submit }`.

**Trust.**
- `caller` is verified with Wix (`{ type: 'VISITOR' | 'MEMBER', id }`, or `undefined` = no proof).
  It comes from wix-server-client's server-set, httpOnly `wix_session` cookie. Key your records on
  `caller.id`, never on an id from `values`.
- A `VISITOR` caller proves a browser session only: anyone can mint one. It is not a person and not
  spam protection. A flow that needs a person checks `caller?.type === 'MEMBER'`.
- `values` come from the browser: re-validate them.
- A Wix submission is **not** a trust boundary: a script can likely post to Wix directly, skipping
  your hook. Your own server-written record is the source of truth; a hidden `reference` in a Wix
  submission is display data, never proof that the hook ran.
- Your own server-side Wix calls run as **the site** (elevated) by default. Use `client` (a Wix
  client acting as the caller, `undefined` without an active session) for calls that must respect
  the caller's permissions. Example: wix-data on the server ignores a collection's member-only
  rules; through `client` (or in the browser) they apply. On `client` only `client.use(module)`,
  `client.graphql` and `wixFetch(..., { authorization })` work; `fetchWithAuth`, `fetch` and
  `enableContext` throw.

**Rejecting.** `throw new ActionError(code, message)` shows `message` to the user as the form-level
error. Any other error is logged on the server and the user sees a generic message.

**`submit(values?, options?)`.** Call it **once**, and `await` or `return` it. `values` replaces the
submitted values (default: the browser's). It rejects when Wix rejects. A
second call, or a call after the hook settled (a timer, an un-awaited chain), does not post: it is
logged and rejects with `SubmitIgnoredError`. Compensate in a `catch`. **Once `submit()` was
called, Wix's outcome alone decides the result**: Wix's per-field errors still reach the fields,
and an error you throw afterwards is logged, not shown (after a successful submit the user still
sees success, without your `redirectTo`).

**Who the submission posts as.** Every form (with or without a hook) posts **as the caller** when
the request has an active `wix_session` cookie, so Wix records the visitor or member as the
submitter; without a session it posts as the site.
- `submit(values, { as: 'site' })` forces the site. A form whose Wix settings restrict submitters
  (for example, members only) and that visitors must still submit needs it. A form without a hook
  that must post as the site registers a one-line hook:
  `{ [FORM_ID]: ({ submit }) => submit(undefined, { as: 'site' }) }`.
- **Expired is not "no session".** When a caller post's session has expired, nothing is posted:
  `submit()` rejects with `SessionExpiredError` and the user sees "Your session expired. Please
  refresh the page and try again." `{ as: 'site' }` is not blocked by an expired cookie.
- **No silent retry.** When Wix refuses a caller post, it is not retried as the site: the user sees
  the generic message and the server logs the status. (A specific "Please sign in to submit this
  form." message is pending: Wix's refusal status for forms is not yet verified.)
- Captcha / spam-protected forms: pending verification. Whether `{ as: 'site' }` helps there is not
  verified yet; do not rely on it.
- Direct `WIX_FORMS_SERVICE.createSubmission(formId, values)` calls are unchanged and post as the site.

**Speed and idempotency.** The browser gives up after 30 s, while the server may still finish; the
user's retry runs the hook again. Keep hooks well within that, and make the write idempotent per
caller + slot (reuse an existing reservation, as above). The duplicate Wix submission is harmless
display data.

**`redirectTo`.** A same-site path (`'/…'`) only. The browser drops an absolute URL or anything that
could leave the site (`'//host'`, `'/..//host'`, control characters) and logs it.

**Hidden fields.** Client validation skips hidden fields, so a required hidden field can be left empty
in the page and filled by the hook through `submit({ ...values, reference })`. Wix re-validates it;
a Wix error on a hidden field appears in the status message as `Label: message`.

### Migrating from `WIX_FORMS_SUBMISSION_AUGMENTER`

The augmenter is removed. `augment` becomes `submit({ ...values, ...derived })`, registered per form
inside `.withServer(...)`:

```ts
// before (also shipped the augmenter to the browser):
registerService(WIX_FORMS_SUBMISSION_AUGMENTER, { async augment() { return { source: 'web' }; } });
// after:
export const init = makeJayInit().withServer(async () => {
  registerService(WIX_FORMS_SUBMIT_HOOKS, {
    [FORM_ID]: async ({ values, submit }) => { await submit({ ...values, source: 'web' }); },
  });
  return {};
});
```

Behaviour changes: a plain `Error` used to reach the user as its text; it is now logged and the user
sees the generic message — throw `ActionError` to show text. A Wix 403 also shows the generic message
(the server log keeps the detail). An `ActionError` thrown after `submit()` was called is logged, not
shown.

## 4c. Non-string fields (checkbox / multiselect)

A single **checkbox** submits its boolean `.checked` state (not a static string); bind its
boolean `value` variant. A **multiselect** submits a `string[]` of all selected values; bind
its `options[].selected` variants. No `dataType: array` exists — the repeated `options`
sub-contract with per-option `selected` is the array representation.

```html
<label><input type="checkbox" ref="contact.consent.input" /> I agree</label>
<select multiple ref="contact.interests.input">
  <option forEach="contact.interests.options" trackBy="value" value="{value}" selected="{selected}">{label}</option>
</select>
```

## 5. Custom UI / multi-step

Any element bound to a field's `control` feeds that field's store slot via its `data-value`
(or `.value`), runs the same validation, and reconciles with a native `input` on the same
field (the store is authoritative, last-wins). This covers date pickers, time-slot grids, and
choosers. The store persists across steps (component state), so a multi-step flow collects
fields across steps into one submission — **step navigation (which step is shown) is
page-owned**, the plugin only holds and submits the values.

```html
<div class="slots">
  <button type="button" forEach="availableSlots" trackBy="id"
          ref="contact.slot.control" data-value="{id}">{label}</button>
</div>
```

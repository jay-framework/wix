Rich production forms with wix-forms.

Builds on the per-form contracts (see `per-form-contracts.md`). Every form's
contract already carries the tags below; a page uses only the ones it binds, and any it
ignores are inert. Everything is driven by one per-field **value store** inside the shared
`wixForm` component — the single source of truth for each field's current value.

## 1. Confirmation / sent state (+ personalized echo)

After a successful submit, `isSubmitted` becomes `true` and stays true until reset. Swap the
form for a thank-you panel with `if`/`if="!"`. The store is NOT cleared on submit, so the
confirmation can echo what was entered via each field's `value`. A `resetButton` clears the
store and returns to a blank form (`isSubmitted=false`).

```html
<form novalidate if="!contact.isSubmitted">
  <label for="contact-email">{contact.email.label}</label>
  <input id="contact-email" ref="contact.email.input" autocomplete="email"
         aria-required="{contact.email.required}" aria-invalid="{contact.email.invalid}"
         aria-describedby="contact-email-error" placeholder="{contact.email.placeholder}" />
  <span id="contact-email-error" class="error" aria-live="polite">{contact.email.error}</span>
  <button ref="contact.submitButton" aria-busy="{contact.isSubmitting}">Send</button>
</form>

<section if="contact.isSubmitted" ref="contact.confirmation" tabindex="-1">
  <h2>Thanks, {contact.firstName.value}!</h2>
  <p>We'll reply to {contact.email.value} shortly.</p>
  <button type="button" ref="contact.resetButton">Send another</button>
</section>

<p role="status" aria-live="polite">{contact.statusMessage}</p>
```

See **§6 Accessibility** for why each attribute is there.

Do **not** gate the confirmation on `statusMessage` — it is a data tag that also carries
submit errors. Use the `isSubmitted` variant. To show your own failure copy, branch on
`submitFailure` (see `user-visible-messages.md`). Note: a confirmation shown after a honeypot
trip (below) does NOT imply the submission was stored — never treat "confirmation shown" as
a persistence guarantee.

**Submit/reset buttons and native form submission.** Keep the submit button a real submit
button — leave `type` off (it defaults to `submit` inside a `<form>`) or write
`type="submit"`. The `wixForm` component listens to the owning `<form>`'s `submit` event,
cancels the browser's page-reloading navigation, and runs the plugin submit, so a click,
Enter in a field, and `requestSubmit()` all work. Do **not** set `type="button"` on the
submit button: it disables Enter-to-submit (a keyboard accessibility expectation) and hides
the submission from password managers/autofill. The reset button is not a submit action, so
mark it `type="button"`:

```html
<button ref="contact.submitButton">Send</button>
...
<button type="button" ref="contact.resetButton">Send another</button>
```

## 2. Prefill (page-provided defaults)

Bind a value the page already has (route param, query, page data) through a hidden
`control`; it seeds that field's store slot (on mount, and again at submit) and **never
overwrites a field the user already edited**:
`<input type="hidden" ref="contact.email.control" data-value="{defaultEmail}" />`.

## 3. Live validation

The plugin validates using the Wix field schema (required + email/tel/url format +
min/max/pattern) — nothing to configure. Typing in a field only **clears** its error; new
errors appear on blur, on a `control` change, and on submit, so a screen reader is not
interrupted on every keystroke. Bind `aria-invalid="{contact.email.invalid}"` on the input
and put the `error` in a polite live region linked by `aria-describedby` (see example
above). The `invalid` variant also drives error styling.

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

## 4b. Non-string fields (checkbox / multiselect)

A single **checkbox** submits its boolean `.checked` state (not a static string); bind its
boolean `value` variant. A **multiselect** submits a `string[]` of all selected values; bind
its `options[].selected` variants. No `dataType: array` exists — the repeated `options`
sub-contract with per-option `selected` is the array representation.

```html
<label><input type="checkbox" ref="contact.consent.input" /> I agree</label>
<label>{contact.interests.label}
  <select multiple ref="contact.interests.input">
    <option forEach="contact.interests.options" trackBy="value" value="{value}" selected="{selected}">{label}</option>
  </select>
</label>
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

On a step change, move focus to the new step's heading (`tabindex="-1"`) — the plugin does
not know which step is shown.

## 6. Accessibility

The plugin owns behavior; the page owns markup. `jay-stack validate` warns on the three
mechanical mistakes marked ⚠️.

**What the plugin does for you**
- Submits from the `<form>`'s `submit` event, so click, Enter, and `requestSubmit()` all work.
- On a failed submit (client or server field errors), focuses the first invalid field's `input`.
- On success, focuses the element bound to `confirmation`; on reset, focuses the first field.

**What the page must do**
- ⚠️ **Label every field input**: wrap it in `<label>{k.f.label} …</label>`, or use
  `<label for>` + `id`, or `aria-label`. A placeholder is not a label.
- ⚠️ **Keep the error outside the `<label>`** (otherwise it becomes part of the field's name).
  Link it with `aria-describedby` and keep the element always present with
  `aria-live="polite"` — not `role="alert"`, which interrupts.
- ⚠️ **No native `required`** without `novalidate` on the `<form>`: the browser's own
  validation cancels the `submit` event, so the plugin never runs. Use
  `aria-required="{k.f.required}"` + `<form novalidate>`.
- **Status region always in the DOM**: `<p role="status" aria-live="polite">{k.statusMessage}</p>`,
  outside the conditional form. A live region inserted together with its text is often not
  announced.
- **Confirmation is focusable**: `ref="k.confirmation" tabindex="-1"` on the thank-you panel.
- **Busy state**: `aria-busy="{k.isSubmitting}"` on the submit button. Avoid `disabled` — it
  drops the button out of tab order mid-submit.
- **`autocomplete`** on personal-data fields (`name`, `given-name`, `email`, `tel`, …).
- **Groups**: wrap a checkbox or radio group in `<fieldset><legend>{k.f.label}</legend> …`.
- **Custom choosers** (`control` buttons): mark the chosen one with `aria-pressed="true"`
  from page data.

## 7. Server-side submit hook (optional)

Register **one hook per form** when the server must act around the submission: verify who is
submitting, re-check availability, write your own record, add server-derived values (often into
a hidden field), redirect to a confirmation page. Forms without a hook submit the browser values
unchanged (see "Who the submission posts as" below).

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

The form id is the `formId` in `agent-kit/references/wix-forms/forms.yaml` (also the generated
contract's `formId` metadata). The hook receives `{ formId, values, caller, client, submit }`.

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
  refresh the page and try again." `{ as: 'site' }` is not blocked by an expired cookie. The page
  sees `submitFailure: PERMISSION`, so it can write its own sign-in copy.
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

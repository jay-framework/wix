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

## 4b. Non-string fields (checkbox / multiselect)

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

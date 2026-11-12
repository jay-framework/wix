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
  <input
    id="contact-email"
    ref="contact.email.input"
    autocomplete="email"
    aria-required="{contact.email.required}"
    aria-invalid="{contact.email.invalid}"
    aria-describedby="contact-email-error"
    placeholder="{contact.email.placeholder}"
  />
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
trip (below, a browser-only check against naive bots), or a success after a server-side honeypot
drop (§4a), does NOT imply the submission was stored — never treat "confirmation shown" (or a
successful result) as a persistence guarantee.

**Submit/reset buttons and native form submission.** Keep the submit button a real submit
button — leave `type` off (it defaults to `submit` inside a `<form>`) or write
`type="submit"`. The `wixForm` component listens to the owning `<form>`'s `submit` event,
cancels the browser's page-reloading navigation, and runs the plugin submit, so a click,
Enter in a field, and `requestSubmit()` all work. The component finds that `<form>` through the
button, so the submit button inside it must carry `ref="<key>.submitButton"`; a `<form>` with
only a plain `<button>` (or Enter-only) is not intercepted and reloads the page (the validator
warns). Do **not** set `type="button"` on the
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
`control`; it seeds that field's store slot after mount, after a reset ("send another"), and
again at submit. The slot **follows the page** while the user has not edited the field: change
`data-value` and the slot updates right away (a visible field's input shows the new value), so
the next submit sends it (also after a failed submit); render `data-value=""` and the slot is
cleared. It **never overwrites a field the user already
edited**. A seeded visible field shows the value in its input:
`<input type="hidden" ref="contact.email.control" data-value="{defaultEmail}" />`.

A bound `control` with neither `data-value` nor `.value` (e.g. a `<div>`) reads as `''` and
clears the slot on every seed until the user interacts with it — widgets that seed a value
must render `data-value`.

## 3. Live validation

The plugin validates using the Wix field schema (required + email/tel/url format +
min/max/pattern) — nothing to configure. Timing is "late to complain, early to forgive":

- **Blur** validates a field only if the user changed it (since mount or reset) or it already
  shows an error. Tabbing past an untouched empty field shows nothing.
- **Typing** in a field that shows an error clears it as soon as the value is valid, and
  otherwise leaves the text alone (one error, no re-announcement per keystroke). This also
  clears a `SERVER` error (from Wix or the hook) once the built-in rules and page checks pass,
  because the browser cannot re-check a server rule — but **submit re-validates**: the next
  submit asks the server again, and a still-bad value comes back with its rule. An error from Wix
  clears when the visitor types and comes back on the next submit if Wix still refuses the value.
- **A `control` change** (or a chip toggle) is a commit and validates immediately.
- **Submit** validates every visible field and focuses the first invalid one, so a skipped
  required field is reported there.
- **Autofill:** at submit the plugin reads each visible text-like input and single `<select>`
  from the DOM, because some browsers autofill without an `input` event; what the user sees is
  what is posted. For a `<select>` that needs an unselected state, add a first
  `<option value="">` (e.g. "Choose…"): without it the browser shows the first option, but the
  form posts `''` until the user or autofill changes the select.
- **Busy from the first click:** `isSubmitting` is set as soon as submit starts, so a second
  click or Enter is ignored, and a reset during submit cancels it.

**Who enforces what.**

- **Phone: what the visitor types vs what gets sent.** The visitor types freely (`054.123.4567`,
  `+972-54-123-4567`, `00972…`) and the input keeps showing it; the plugin **sends** the compact
  international form `+972541234567`. That is the only phone shape Wix accepts from a visitor (the
  plugin's default caller path; a site-key post is more lenient, so don't test phones that way).
  A number typed without a country code needs a country: set `defaultPhoneCountry: IL` (ISO code)
  in `config/.wix-forms.yaml`; without it the browser refuses such numbers with `PHONE_COUNTRY`
  ("include the country code"). A real Wix Phone field's default country and Accepted countries
  are respected once the plugin reads them. Values that cannot become an international number
  (`12`, `abc`) are refused as `PHONE`. Don't write a page check that re-validates phones.
- **Format (Email / URL): Wix enforces it on its server.** The browser's format rules are never
  stricter than Wix's: they block only values Wix also refuses (no `@`, a missing `scheme://`). A
  value only Wix refuses (e.g. `a@b.c`) passes the browser and comes back from Wix after submit. To
  accept other formats, change the Wix field to Short answer — don't write a page check that
  copies Wix's (unpublished) rule.
- **`required` and choice options: the browser only.** Wix accepts and confirms empty required
  fields and choice values outside the field's options when the site posts (verified); the caller
  path is unverified. The plugin enforces `required` in the browser only. A site that needs server
  enforcement refuses in its submit hook with `FieldRejection` (§7).

Bind `aria-invalid="{contact.email.invalid}"` on the input
and put the `error` in a polite live region linked by `aria-describedby` (see example
above). The `invalid` variant also drives error styling.

### Which rule failed — `errorRule`

Every visible field has an `errorRule` variant:
`NONE | REQUIRED | MIN_LENGTH | MAX_LENGTH | EMAIL | PHONE | URL | PATTERN | CUSTOM | SERVER | PHONE_COUNTRY`.
`error` keeps the English default text; for your own wording (or another language) branch on
`errorRule` — never match the `error` text.

```html
<span id="c-email-err" aria-live="polite">
  <span if="contact.email.errorRule === REQUIRED">Email is required.</span>
  <span if="contact.email.errorRule === EMAIL">That email doesn't look right.</span>
  <span if="contact.email.errorRule === CUSTOM">{contact.email.error}</span>
  <span if="contact.email.errorRule === SERVER">{contact.email.error}</span>
</span>
```

- **The rule is the same whoever caught it.** A format error Wix refuses after submit (e.g.
  `a@b.c`, which passes the browser) carries `EMAIL` / `PHONE` / `URL` and the same default
  `error` text as the browser check, so one copy per rule covers both.
- `PHONE_COUNTRY`: a phone typed without a country code and no default country, or from a
  country the Wix Phone field does not accept. **Author checklist: on a phone field, branch on
  `PHONE` and `PHONE_COUNTRY`, or show `{field.error}` unconditionally** (`jay-stack validate`
  warns about a `PHONE` branch without `PHONE_COUNTRY`).
- `CUSTOM` is a page check's own message. `SERVER` means Wix refused the value for a reason the
  plugin does not classify, or it is the site owner's custom validation message, or (for now) a
  submit hook's `FieldRejection` — `error` is that server text; print it.
- **Write `REQUIRED` copy that still reads correctly while the field holds text.** Typing never
  swaps one error for another, so a field showing `REQUIRED` that receives a partial value
  (e.g. `a` in an email field) keeps `REQUIRED` until it becomes valid (cleared) or is
  blurred/submitted (re-checked to `EMAIL`). Say "Email is required", not "The field is empty".

### Page checks — your own rules

Rules the Wix schema cannot express (a real TLD, a phone valid for the chosen country, a
cross-field rule) are **page checks**: functions registered per form on `WIX_FORMS_CONTEXT`
(import it from `@jay-framework/wix-forms/client`; the plugin's client init creates it).

```ts
import { WIX_FORMS_CONTEXT } from '@jay-framework/wix-forms/client';

// In a page component's interactive phase, declared with .withContexts(WIX_FORMS_CONTEXT):
const forms = useContext(WIX_FORMS_CONTEXT);
const unregister = forms.registerFieldChecks(BOOKING_FORM_ID, {
  phone: [
    (value) =>
      isValidPhone(String(value)) ? undefined : 'Use an international number, e.g. +44 20 …',
  ],
});
```

- A check gets `(value, values)` and returns a message to fail, nothing to pass. Checks run in
  order, **only after the built-in rules pass** (a field has one `errorRule` at a time), on the
  same triggers as the built-ins (blur / typing above, and submit with the submitted values).
  The first message wins and shows as `errorRule === CUSTOM`.
- Key by the form's **id** (any case). A key that is not a form id, or a target the form does
  not show as a visible field, is warned about once in the console and never runs.
- A check that throws is logged once and treated as passing — a page bug must not block submit.
- Checks are synchronous; checks registered after the form mounted still run.
- **A page check is not a security check.** It is browser UX; re-validate on the server in the
  form's submit hook (§7).

## 4a. Hidden values + honeypot

- **Hidden page values** reuse the `control` channel on a Wix hidden field — one hidden input
  populates it and it reaches the submission:
  `<input type="hidden" ref="contact.propertyId.control" data-value="{propertyId}" />`.
- **Honeypot** — bind a visually-hidden input to the reserved `honeypot` tag. A real user
  never fills it; a bot that auto-fills every input trips it and the submit is silently
  aborted (no `createSubmission`) while still showing the confirmation, so the bot cannot
  tell:

  ```html
  <input
    ref="contact.honeypot"
    type="text"
    tabindex="-1"
    autocomplete="off"
    aria-hidden="true"
    style="position:absolute;left:-9999px"
  />
  ```

  The honeypot stops naive bots that fill every input in the DOM: the browser check drops them
  **without any request**. Direct posts are covered on the server too: the `submitForm` action
  has an optional `honeypot` input (the plugin component never sends it). A direct post with a
  non-empty `honeypot` is **dropped by default** when the form has no hook (fake success, no Wix
  call). With a hook, the hook receives `honeypot` and decides: drop with `return { dropped: true }`
  (§7). Absent ≠ human: any script can omit the input, and a replay of the plugin's own request
  carries none. It is not spam protection: for spam control, use Wix's form settings, your edge,
  or rate limits in a submit hook.

## 4b. Non-string fields (checkbox / multiselect)

A single **checkbox** submits its boolean `.checked` state (not a static string); bind its
boolean `value` variant. A **multiselect** submits a `string[]` of all selected values; bind
its `options[].selected` variants. No `dataType: array` exists — the repeated `options`
sub-contract with per-option `selected` is the array representation.

```html
<label><input type="checkbox" ref="contact.consent.input" /> I agree</label>
<label
  >{contact.interests.label}
  <select multiple ref="contact.interests.input">
    <option
      forEach="contact.interests.options"
      trackBy="value"
      value="{value}"
      selected="selected"
    >
      {label}
    </option>
  </select>
</label>
```

**Checkbox chips.** To draw a multiselect as a group of checkboxes, bind each option's
checkbox to `options.toggle`. Each change adds or removes that option, and the submission
stays a `string[]` in option order. Multi-choice checkboxes bind `options.toggle`; `control`
is single-value, so each click would replace the whole selection (the validator warns).
`toggle` exists only on a multiselect's options, not on a single `select`.

```html
<style>
  /* Visually hidden but focusable and clickable through its <label> — never display:none. */
  .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
             overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>
<form novalidate>
<fieldset aria-describedby="contact-interests-error">
  <legend>{contact.interests.label}<span if="contact.interests.required"> (required)</span></legend>
  <label forEach="contact.interests.options" trackBy="value" class="chip {selected ? on}">
    <input type="checkbox" class="sr-only" ref="contact.interests.options.toggle" value="{value}" checked="selected" aria-invalid="{$parent.contact.interests.invalid}" /> {label}
  </label>
  <span id="contact-interests-error" class="error" aria-live="polite">{contact.interests.error}</span>
</fieldset>
<label><input type="checkbox" ref="contact.consent.input" /> I agree</label>
<button ref="contact.submitButton">Send</button>
</form>
```

- Boolean attributes (`checked`, `selected`, `disabled`, …) take jay's **condition syntax**
  without braces: `checked="selected"`, `selected="selected"`. Never `checked="{selected}"`:
  that renders the string `checked="false"`, and any present `checked`/`selected` attribute
  means checked/selected, so every chip would start checked and the first click would
  invert the selection. The store starts empty and wix-forms reflects each input's
  `checked` property itself on toggle and on reset, so the binding only matters for the
  first render.
- Inside `forEach` over `options`, bindings are relative to the option (`{value}`, `{label}`,
  `{selected}`); reach the field with `$parent.` (`{$parent.contact.interests.invalid}`). A
  plain `{contact.interests.invalid}` there fails to compile ("data field not found").
- Put `aria-invalid` on each chip `<input>`, not on the `<fieldset>` (the `group` role does
  not support it). Hide the input visually with clipping, never `display:none`, so it stays
  focusable; a failed submit focuses the first chip of an invalid group.

## 5. Custom UI / multi-step

Any element bound to a field's `control` feeds that field's store slot via its `data-value`
(or `.value`; render `data-value`, see §2), runs the same validation, and reconciles with a native `input` on the same
field (the store is authoritative, last-wins). This covers date pickers, time-slot grids, and
choosers. The store persists across steps (component state), so a multi-step flow collects
fields across steps into one submission — **step navigation (which step is shown) is
page-owned**, the plugin only holds and submits the values.

```html
<div class="slots">
  <button
    type="button"
    forEach="availableSlots"
    trackBy="id"
    ref="contact.slot.control"
    data-value="{id}"
  >
    {label}
  </button>
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
- Errors appear on blur only for fields the user changed (§3), so tabbing through an empty
  form announces nothing; submit reports every invalid field.
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

Phones reach the hook as compact international numbers (`+972541234567`, §3), not as typed.

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
import { WIX_FORMS_SUBMIT_HOOKS, FieldRejection } from '@jay-framework/wix-forms';

export const init = makeJayInit().withServer(async () => {
  registerService(WIX_FORMS_SUBMIT_HOOKS, {
    [REQUEST_VISIT_FORM_ID]: async ({ values, caller, honeypot, submit }) => {
      if (honeypot) return { dropped: true }; // first line of every hook (§4a)
      if (caller?.type !== 'MEMBER')
        // a VISITOR proves a session only
        throw new ActionError('SIGN_IN_REQUIRED', 'Please sign in again to request a visit.');
      const slot = parseSlot(values); // values are UNTRUSTED: re-validate
      const reservation =
        (await reservations.findOwn(caller.id, slot)) ?? // a retry reuses it
        (await reservations.createIfFree({ ownerId: caller.id, slot }));
      if (!reservation)
        throw new ActionError('SLOT_TAKEN', 'That time was just taken. Please pick another.');
      try {
        await submit({ ...values, reference: reservation.reference }); // hidden, required field
      } catch (error) {
        await reservations.remove(reservation.id); // compensate
        throw error; // or swallow it: same result
      }
      return { redirectTo: `/visit/confirmed?ref=${encodeURIComponent(reservation.reference)}` };
    },
  });
  return {};
});
```

The form id is the `formId` in `agent-kit/references/wix-forms/forms.yaml` (also the generated
contract's `formId` metadata). The hook receives `{ formId, values, caller, client, honeypot, submit }`.
Hook keys are the form id, in any case; a key that is not a form id (such as `'contact-us'`) never
matches and is warned about once on the server.

**Which forms accept submissions.** Only forms in `formIds` (`config/.wix-forms.yaml`), or else the
namespace's enabled forms, accept submissions; any other id is refused (`submitFailure: REJECTED`).
**Registering a hook does not make a form submittable:** a hooked form outside that list is refused
before its hook runs. A form created after deploy is refused until the server restarts.

**Trust.**

- `caller` is verified with Wix (`{ type: 'VISITOR' | 'MEMBER', id }`, or `undefined` = no proof).
  It comes from wix-server-client's server-set, httpOnly `wix_session` cookie. Key your records on
  `caller.id`, never on an id from `values`.
- A `VISITOR` caller proves a browser session only: anyone can mint one. It is not a person and not
  spam protection. A flow that needs a person checks `caller?.type === 'MEMBER'`. A visitor session
  proves a browser session, not a person: rate-limit in the hook or at the edge.
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

**Dropping (honeypot).** `honeypot` is the trimmed `honeypot` action input (`''` when absent). It is
untrusted and advisory: the plugin's own component never sends it, so `''` does not mean human.
Make `if (honeypot) return { dropped: true };` the first line of every hook: a hook that ignores it
posts honeypot-filled direct submissions (without a hook the plugin drops them for you). Return
`{ dropped: true }` **without** calling `submit()`: the caller sees a plain success (your
`redirectTo` is honoured), nothing reaches Wix, and the server logs the drop at info level. After a
successful `submit()`, `dropped` is ignored (the post happened) and logged.

**Rejecting specific fields.** Validate first, then `throw new FieldRejection(fieldErrors, { code? })`
(from `@jay-framework/wix-forms`) **before** calling `submit()`: `fieldErrors` maps field target →
your own message. The page gets `submitFailure: VALIDATION`; each visible target shows its message
on the field with `errorRule: SERVER` and focus moves to the first one; a hidden or unknown target
goes to the status message. This is the server half of page checks (§3): re-validate here what the
page checked in the browser.
It is also the only server enforcement of `required` and choice options: Wix accepts and confirms
an empty required field when the site posts (§3), so a site that needs it checks in the hook:

```ts
if (!String(values.full_name ?? '').trim()) {
  throw new FieldRejection({ full_name: 'Full name is required.' });
}
```

```ts
[BOOKING_FORM_ID]: async ({ values, submit }) => {
  if (!isValidPhone(String(values.phone)))
    throw new FieldRejection({ phone: 'Please check the phone number.' }, { code: 'BAD_PHONE' });
  await submit();
},
```

Throwing `FieldRejection` **after** `submit()` does nothing visible: the post already happened, Wix's
outcome decides, and the rejection is only logged. An empty `fieldErrors` is treated as an
unexpected error (generic message).

**Reacting to the outcome in page code — `code` and `onSubmitOutcome`.** A hook's rejection code
(`ActionError(code, …)` or `FieldRejection(…, { code })`) is returned as `code` and delivered to
page code by the plugin's client context: subscribe with `onSubmitOutcome` (it fires once per settled
submit of any plugin form; the handler gets `{ event }`). It returns an unsubscribe function. The
context is global and outlives the page, so subscribe inside `createEffect` and return it: jay runs
the cleanup on unmount, and without it a left page's handler keeps firing for later submits. There is no contract variant
for your codes: they are your vocabulary. For markup-only copy per code, keep your own page
variant and set it from the event. The plugin outcome stays `submitFailure` (`REJECTED`,
`VALIDATION`, …).

```ts
// page component, interactive phase; the page declared .withContexts(WIX_FORMS_CONTEXT)
const forms = useContext(WIX_FORMS_CONTEXT); // from '@jay-framework/wix-forms/client'
createEffect(() =>
  forms.onSubmitOutcome(({ event }) => {
    if (event.formId !== BOOKING_FORM_ID || event.outcome !== 'failed') return;
    if (event.code === 'SLOT_TAKEN') {
      setSelectedSlot(undefined); // hidden data-value → "": the slot follows right away (§2)
      void reloadAvailability();
    }
  }),
); // the returned unsubscribe is the effect's cleanup
```

`event` is `{ formId, outcome: 'succeeded', redirectTo? }` or `{ formId, outcome: 'failed', reason,
code?, fieldErrors? }`; `formId` is canonical (lower case), so filter on it when a page has two
forms. Client validation reports `reason: VALIDATION` with the client messages, a lost request
`reason: NETWORK`; only hook failures carry a `code`. **The event reports what the visitor was
shown, never what was stored:** a honeypot trip and a server-side drop both read `succeeded`, like a
real success. It is not a persistence signal; get that from your own server-side state. Without
the plugin's client init nothing is emitted.

**`submit(values?, options?)`.** Call it **once**, and `await` or `return` it. `values` replaces the
submitted values (default: the browser's). It rejects when Wix rejects. A
second call, or a call after the hook settled (a timer, an un-awaited chain), does not post: it is
logged and rejects with `SubmitIgnoredError`. Compensate in a `catch`. **Once `submit()` was
called, Wix's outcome alone decides the result**: Wix's per-field errors still reach the fields,
and an error you throw afterwards is logged, not shown (after a successful submit the user still
sees success, without your `redirectTo`).

**Who the submission posts as.** Every form (with or without a hook) posts **as the caller** when
the request has an active `wix_session` cookie, so Wix records the visitor or member as the
submitter. **Without a session cookie the submission is refused** (`submitFailure: PERMISSION`,
generic message; `submit()` rejects with `NoCallerSessionError`), unless the hook calls
`submit(values, { as: 'site' })`.

- `submit(values, { as: 'site' })` forces the site. A form whose Wix settings restrict submitters
  (for example, members only) and that visitors must still submit needs it.
- A `{ as: 'site' }` hook posts with the site's credentials for every caller, cookie or not,
  scripts included: it opts the form out of Wix's submitter restriction (such as members-only).
  For a members-only form that visitors must submit, require a session first
  (`if (!client) throw new ActionError(…)`, then `submit(undefined, { as: 'site' })`). Use the
  unconditional one-liner `{ [FORM_ID]: ({ submit }) => submit(undefined, { as: 'site' }) }` only
  for a form that is truly public.
- If you call `submitForm` yourself (not through the `wixForm` component),
  `await ensureSessionFresh()` from `@jay-framework/wix-server-client/client` first. On a new
  visitor's first page the session sync may still be in flight, and a submit without the cookie
  is refused.
- **Expired is not "no session".** When a caller post's session has expired, nothing is posted:
  `submit()` rejects with `SessionExpiredError` and the user sees "Your session expired. Please
  refresh the page and try again." `{ as: 'site' }` is not blocked by an expired cookie. The page
  sees `submitFailure: PERMISSION`, so it can write its own copy; `PERMISSION` does not always mean
  signed out.
- **No silent retry.** When Wix refuses a caller post, it is not retried as the site: the user sees
  "Please sign in to submit this form." when Wix answers 403 (permission denied), otherwise the
  generic message; the server logs the status either way.
- Captcha / spam-protected forms: pending verification. Whether `{ as: 'site' }` helps there is not
  verified yet; do not rely on it.
- Direct `WIX_FORMS_SERVICE.createSubmission(formId, values)` calls are unchanged and post as the site.

**Speed and idempotency.** The browser gives up after 30 s, while the server may still finish; the
user's retry runs the hook again. Keep hooks well within that, and make the write idempotent per
caller + slot (reuse an existing reservation, as above). The duplicate Wix submission is harmless
display data.

**`redirectTo`.** A same-site path (`'/…'`) only. The browser drops an absolute URL or anything that
could leave the site (`'//host'`, `'/..//host'`, control characters) and logs it.
On a redirect the form does **not** show its confirmation: `isSubmitted` stays false and
`submitState` reads `SUBMITTING` (the button stays busy) until the page unloads, so nothing flashes
or takes focus. Page code sees the redirect through `onSubmitOutcome` (`succeeded` + `redirectTo`).
A dropped unsafe `redirectTo` shows the confirmation as usual.

**Hidden fields.** Client validation skips hidden fields, so a required hidden field can be left empty
in the page and filled by the hook through `submit({ ...values, reference })`. Wix re-validates it;
a Wix error on a hidden field appears in the status message as `Label: message`.

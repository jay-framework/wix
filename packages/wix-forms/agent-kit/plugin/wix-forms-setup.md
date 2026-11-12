Wix Forms plugin setup — dynamic forms and shared getFormSummary action.

## What wix-forms provides

Per-form headless contracts (one per Wix form) and two server actions:

- **form/&lt;slug&gt;** — one contract generated per Wix form at agent-kit time, with
  tags named after that form's fields. See `per-form-contracts.md` and
  `user-visible-messages.md` (Wix vs plugin copy, success/i18n).
- **getFormSummary** — returns participant field schema for other plugins (e.g. wix-bookings)
- **submitForm** — submits form values to Wix Forms. If you call it yourself (not through the `wixForm` component), `await ensureSessionFresh()` from `@jay-framework/wix-server-client/client` first: a submit without the session cookie is refused
- **`WixFormsService.isSubmittableForm(formId)`** — the same allowlist check `submitForm` runs. It expects the canonical id, the form GUID in lowercase: trim and lowercase project input first, or a differently cased id reads as not submittable.

## Setup steps

### 1. Prerequisites

`@jay-framework/wix-server-client` must be configured first (`config/.wix.yaml` with site ID and API key).

### 2. Config file (optional)

Running `jay-stack setup wix-forms` creates `config/.wix-forms.yaml`. It is an
**optional filter/override** — per-form contracts are generated for every enabled
form in the namespace whether or not this file exists:

```yaml
namespace: "wix.form_app.form"   # List Forms namespace (default shown)
formIds: []                       # restrict to specific form ids (empty = all); also the runtime submit allowlist
include: enabled                  # enabled | disabled | all
```

### 3. API key permissions

In [Wix API Keys Manager](https://manage.wix.com/account/api-keys), enable **Wix Forms** on your API key.

| Symptom | Fix |
|---------|-----|
| 403 on form schema or submit | Add **Wix Forms** permission to API key |
| Console: `[wix-forms] No forms listed for namespace …` | Often normal before any forms exist. If you expected contracts, check `namespace`, `formIds`, and `include` in `config/.wix-forms.yaml`, then re-run agent-kit |
| Form loads but no fields | Form has no supported input fields in Wix schema |

### 4. Bind forms in page markup

A page can host **one or many** Wix forms. Each form you render needs its own
headless script in the page (usually in `<head>`). Two names show up in that
script — do not confuse them:

| Attribute | Meaning | Who sets it |
|-----------|---------|-------------|
| `contract="form/<slug>"` | Which generated contract to load (which Wix form) | **Agent-kit**, from the form’s Wix name → kebab **slug** (see `forms.yaml`) |
| `key="…"` | Prefix for bindings on **this page** (`{key.email.label}`, `ref="key.submitButton"`) | **You** — any valid identifier; must be **unique among scripts on the same page** |

The slug in `contract` is **not** the same thing as `key`. They often look alike
when a page has a single form (e.g. both `contact`), but with **multiple forms**
on one page you typically keep distinct keys while each script points at its own
`form/<slug>` from `agent-kit/references/wix-forms/forms.yaml`:

```html
<!-- Form A: contract slug from forms.yaml; key is your page prefix -->
<script type="application/jay-headless"
  plugin="@jay-framework/wix-forms"
  contract="form/contact"
  key="contact">
</script>

<!-- Form B on the same page: different contract + different key -->
<script type="application/jay-headless"
  plugin="@jay-framework/wix-forms"
  contract="form/newsletter"
  key="newsletter">
</script>

<form novalidate if="!contact.isSubmitted">
  <label>{contact.email.label}
    <input ref="contact.email.input" autocomplete="email"
           aria-required="{contact.email.required}" placeholder="{contact.email.placeholder}" />
  </label>
  <button ref="contact.submitButton">Send</button>
</form>
<p if="contact.isSubmitted" ref="contact.confirmation" tabindex="-1">Thank you — we received your message.</p>

<form novalidate>
  <label>{newsletter.email.label}
    <input ref="newsletter.email.input" autocomplete="email" />
  </label>
  <button ref="newsletter.submitButton">Subscribe</button>
</form>
```

For errors, status announcements and focus, follow the accessible pattern in `rich-forms.md`.

After `jay-stack agent-kit`, read `forms.yaml` for each form’s exact
`contract` value (the slug) and each field's contract `tag` — not the Wix form id. Tags come
from Wix field targets, which Wix often auto-generates (`firstName_5820`, `formFieldAa5f` for a
consent checkbox): look the field up by its label in the form's `tagByLabel` map, then bind
that tag (`{contact.formFieldAa5f.label}`). Never rename a tag — it is the contract.

See `per-form-contracts.md` for the full contract shape and binding rules, and
`user-visible-messages.md` when changing success, error, or localized copy.

For rich production forms — sent/thank-you state, live validation, hidden and
page-provided values, custom-UI/multi-step, honeypot, non-string fields, and a
server-side submit hook (verify the caller, write your own record, redirect) — see
`rich-forms.md`.

## Cross-plugin use: getFormSummary

`wix-bookings` loads participant fields via `getFormSummary` — it does **not** use the `wix-form` UI on `/book`.

```typescript
import { getFormSummary } from '@jay-framework/wix-forms';
```

Flow: user selects a booking service → `getFormSummary({ formId: service.formId })` → user fills participant fields → `createBooking`.

- **`required` is always `false`.** Wix's Form Summary API returns each field's `target`,
  `label`, `type`, and options — not whether it is required — so `getFormSummary` cannot
  report it, and `createBooking` does not enforce it either. Mark fields you know are required
  (e.g. first name, email) in your jay-html.
- **Only text-like fields are returned** (string, email, phone, number, URL). Address and other
  non-text fields are dropped, even when required.
- An invalid or missing `formId` is refused with an `ActionError` `INVALID_INPUT` (a 4xx),
  before any Wix call.

## Config reference

`config/.wix-forms.yaml` (all fields optional):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `namespace` | string | No | List Forms namespace. Default `wix.form_app.form` (standalone Wix Forms) |
| `formIds` | string[] | No | Restrict generation to these form ids (empty = all forms in namespace). Also the runtime submit allowlist: when set, `submitForm` refuses other forms (empty = the namespace's enabled forms) |
| `include` | enum | No | `enabled` (default) \| `disabled` \| `all` |
| `defaultPhoneCountry` | string | No | ISO 3166-1 alpha-2 code (e.g. `IL`, `US`) for phones typed without a country code. A Wix Phone field's own default country wins when set. Without either, such phones are refused with `PHONE_COUNTRY`. An unsupported code fails init with an error naming the key. See `rich-forms.md` §3 |

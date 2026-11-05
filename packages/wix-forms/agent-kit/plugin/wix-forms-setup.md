Wix Forms plugin setup — dynamic forms and shared getFormSummary action.

## What wix-forms provides

Per-form headless contracts (one per Wix form) and two server actions:

- **form/&lt;slug&gt;** — one contract generated per Wix form at agent-kit time, with
  tags named after that form's fields. See `per-form-contracts.md` and
  `user-visible-messages.md` (Wix vs plugin copy, success/i18n).
- **getFormSummary** — returns participant field schema for other plugins (e.g. wix-bookings)
- **submitForm** — submits form values to Wix Forms

## Setup steps

### 1. Prerequisites

`@jay-framework/wix-server-client` must be configured first (`config/.wix.yaml` with site ID and API key).

### 2. Config file (optional)

Running `jay-stack setup wix-forms` creates `config/.wix-forms.yaml`. It is an
**optional filter/override** — per-form contracts are generated for every enabled
form in the namespace whether or not this file exists:

```yaml
namespace: "wix.form_app.form"   # List Forms namespace (default shown)
formIds: []                       # restrict to specific form ids (empty = all)
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

<form>
  <label>{contact.email.label}
    <input ref="contact.email.input" placeholder="{contact.email.placeholder}" />
  </label>
  <button ref="contact.submitButton">Send</button>
  <p class="success" if="contact.statusMessage">Thank you — we received your message.</p>
</form>

<form>
  <label>{newsletter.email.label}
    <input ref="newsletter.email.input" />
  </label>
  <button ref="newsletter.submitButton">Subscribe</button>
</form>
```

After `jay-stack agent-kit`, read `forms.yaml` for each form’s exact
`contract` value (the slug) and field `target` names — not the Wix form id.

See `per-form-contracts.md` for the full contract shape and binding rules, and
`user-visible-messages.md` when changing success, error, or localized copy.

## Cross-plugin use: getFormSummary

`wix-bookings` loads participant fields via `getFormSummary` — it does **not** use the `wix-form` UI on `/book`.

```typescript
import { getFormSummary } from '@jay-framework/wix-forms';
```

Flow: user selects a booking service → `getFormSummary({ formId: service.formId })` → user fills participant fields → `createBooking`.

## Config reference

`config/.wix-forms.yaml` (all fields optional):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `namespace` | string | No | List Forms namespace. Default `wix.form_app.form` (standalone Wix Forms) |
| `formIds` | string[] | No | Restrict generation to these form ids (empty = all forms in namespace) |
| `include` | enum | No | `enabled` (default) \| `disabled` \| `all` |

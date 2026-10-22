Wix Forms plugin setup — dynamic forms and shared getFormSummary action.

## What wix-forms provides

Per-form headless contracts (one per Wix form) and two server actions:

- **form/&lt;slug&gt;** — one contract generated per Wix form at agent-kit time, with
  tags named after that form's fields. See `per-form-contracts.md` (DL#38).
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
| "No forms found in namespace …" | Confirm `namespace` in `config/.wix-forms.yaml` matches your site's forms |
| Form loads but no fields | Form has no supported input fields in Wix schema |

### 4. Page form

Each form has its own contract `form/<slug>`. Discover slugs and field names in
`agent-kit/references/wix-forms/forms.yaml`, then bind explicit field tags:

```html
<script type="application/jay-headless"
  plugin="@jay-framework/wix-forms"
  contract="form/contact"
  key="contact">
</script>

<form>
  <label>{contact.email.label}
    <input ref="contact.email.input" placeholder="{contact.email.placeholder}" />
  </label>
  <button ref="contact.submitButton">Send</button>
  <p if="contact.statusMessage">{contact.statusMessage}</p>
</form>
```

See `per-form-contracts.md` for the full contract shape and binding rules (DL#38).

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

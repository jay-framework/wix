Wix Forms plugin setup — auto-discovered site forms, materialized contracts, and AIditor Add Menu.

## What wix-forms provides

One headless component with **materialized per-form contracts** (auto-fetched from Wix), plus two server actions:

- **form/\<ContractName\>** — dynamic contracts generated at `jay-stack agent-kit` (e.g. `form/get-in-touch-form`)
- **getFormSummary** — returns participant field schema for other plugins (e.g. wix-bookings)
- **submitForm** — submits form values to Wix Forms

**No manual forms config.** Credentials in `config/.wix.yaml` connect to your Wix site; the plugin lists all Wix Forms (`namespace: wix.form_app.form`) and materializes contracts for forms with usable input fields.

## Setup steps

### 1. Prerequisites

`@jay-framework/wix-server-client` must be configured first (`config/.wix.yaml` with site ID and API key).

### 2. Setup and agent-kit

```bash
jay-stack setup wix-server-client
jay-stack setup wix-forms
jay-stack agent-kit
```

Setup verifies the Wix Forms API returns at least one usable form.  
`agent-kit` writes:

| Output | Purpose |
|--------|---------|
| `agent-kit/materialized-contracts/wix-forms/form-*.jay-contract` | Validate + contract bindings |
| `agent-kit/plugins-index.yaml` | Contract discovery for agents |
| `agent-kit/aiditor/add-menu/wix-forms.generated.yaml` | **+ Add** panel and **@ autocomplete** |

There is **no** `config/.wix-forms.yaml` and **no** `agent-kit/references/wix-forms/forms.yaml`.

### 3. API key permissions

In [Wix API Keys Manager](https://manage.wix.com/account/api-keys), enable **Wix Forms** on your API key.

| Symptom | Fix |
|---------|-----|
| 403 on form schema or submit | Add **Wix Forms** permission to API key |
| Setup error: no forms found | Create a form in Wix dashboard; ensure Wix Forms app is on the site |
| Unknown contract | Run `jay-stack agent-kit` after adding forms in Wix |
| Form missing from catalog | Form has no supported input fields — check Wix form editor |

### 4. Page form

Pick the contract from `agent-kit/plugins-index.yaml` or the **Forms** category in AIditor **+ Add** / **@** autocomplete:

```html
<script type="application/jay-headless"
  plugin="@jay-framework/wix-forms"
  contract="form/get-in-touch-form"
  key="contact">
</script>

<jay:contact-form>
  <form if="contact.fields.length">
    <div forEach="contact.fields" trackBy="target">
      <label>{field.label}</label>
      <input if="!field.isTextarea && !field.hasOptions"
        ref="field.formInputs" type="{field.inputType}" />
      <textarea if="field.isTextarea" ref="field.formTextareas"></textarea>
      <select if="field.hasOptions" ref="field.formSelects">
        <option forEach="contact.options" trackBy="id"
          if="option.fieldTarget === field.target"
          value="{option.value}">{option.label}</option>
      </select>
    </div>
    <button ref="contact.submitButton">Send</button>
  </form>
</jay:contact-form>
```

Bindings stay `forEach="contact.fields"` — **not** top-level `{contact.email}` tags.

The **+ Add** menu item for each form includes a ready-made jay-html snippet (inputs + submit) for the marker location.

### Cross-plugin use: getFormSummary

`wix-bookings` loads participant fields via `getFormSummary` — it does **not** use the form UI component on `/book`.

```typescript
import { getFormSummary } from '@jay-framework/wix-forms';
```

Flow: user selects a booking service → `getFormSummary({ formId: service.formId })` → user fills participant fields → `createBooking`.

## AIditor integration

| Feature | Source |
|---------|--------|
| **+ Add** panel → Forms category | `agent-kit/aiditor/add-menu/wix-forms.generated.yaml` |
| **@ autocomplete** in instructions | Same Add Menu catalog (asset mentions) |
| **stage-place** at marker | Add Menu `interaction.mode: stage-place` + prompt with full form jay-html |

Re-run `jay-stack agent-kit` after adding or renaming forms in Wix.

See Design Log #31 (auto-fetch revision) and #32 in the wix repo.

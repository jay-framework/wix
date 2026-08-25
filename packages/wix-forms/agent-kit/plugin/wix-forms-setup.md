Wix Forms plugin setup — dynamic forms and shared getFormSummary action.

## What wix-forms provides

One headless contract and two server actions:

- **wix-form** — dynamic form loaded from Wix Forms by form ID
- **getFormSummary** — returns participant field schema for other plugins (e.g. wix-bookings)
- **submitForm** — submits form values to Wix Forms

## Setup steps

### 1. Prerequisites

`@jay-framework/wix-server-client` must be configured first (`config/.wix.yaml` with site ID and API key).

### 2. Config file

Running `jay-stack setup wix-forms` creates `config/.wix-forms.yaml` if it doesn't exist:

```yaml
defaultFormId: ""
```

Set `defaultFormId` to the form ID from **Wix Dashboard → Forms**.

### 3. API key permissions

In [Wix API Keys Manager](https://manage.wix.com/account/api-keys), enable **Wix Forms** on your API key.

| Symptom | Fix |
|---------|-----|
| 403 on form schema or submit | Add **Wix Forms** permission to API key |
| "Form ID is missing" | Set `defaultFormId` in `config/.wix-forms.yaml` |
| Form loads but no fields | Form has no supported input fields in Wix schema |

### 4. Page form

Add to any page that needs a Wix form:

```html
<script type="application/jay-headless"
  plugin="@jay-framework/wix-forms"
  contract="wix-form"
  key="contact">
</script>

<jay:wix-form>
  <form if="contact.fields.length">
  </form>
</jay:wix-form>
```

The component loads the form schema from Wix, renders fields dynamically, validates input, and submits via `submitForm`.

## Cross-plugin use: getFormSummary

`wix-bookings` loads participant fields via `getFormSummary` — it does **not** use the `wix-form` UI on `/book`.

```typescript
import { getFormSummary } from '@jay-framework/wix-forms';
```

Flow: user selects a booking service → `getFormSummary({ formId: service.formId })` → user fills participant fields → `createBooking`.

## Config reference

`config/.wix-forms.yaml`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `defaultFormId` | string | Yes | Wix Forms form ID used when no `formId` prop is passed |

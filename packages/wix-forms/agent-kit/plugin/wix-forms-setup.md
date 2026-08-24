Wix Forms plugin setup — contact form and shared getFormSummary action.

## What wix-forms provides

One headless contract and two server actions:

- **contact-form** — dynamic contact form loaded from Wix Forms by form ID
- **getFormSummary** — returns participant field schema for other plugins (e.g. wix-bookings)
- **submitForm** — submits form values to Wix Forms

## Setup steps

### 1. Prerequisites

`@jay-framework/wix-server-client` must be configured first (`config/.wix.yaml` with site ID and API key).

### 2. Config file

Running `jay-stack setup wix-forms` creates `config/.wix-forms.yaml` if it doesn't exist:

```yaml
defaultContactFormId: ""
```

Set `defaultContactFormId` to the form ID from **Wix Dashboard → Forms**.

### 3. API key permissions

In [Wix API Keys Manager](https://manage.wix.com/account/api-keys), enable **Wix Forms** on your API key.

| Symptom | Fix |
|---------|-----|
| 403 on form schema or submit | Add **Wix Forms** permission to API key |
| "Contact form ID is missing" | Set `defaultContactFormId` in `config/.wix-forms.yaml` |
| Form loads but no fields | Form has no supported input fields in Wix schema |

### 4. Home page contact form

Add to your home page or contact section:

```html
<script type="application/jay-headless"
  plugin="@jay-framework/wix-forms"
  contract="contact-form"
  key="contact">
</script>

<jay:contact-form>
  <form if="contact.fields.length">
  </form>
</jay:contact-form>
```

The component loads the form schema from Wix, renders fields dynamically, validates input, and submits via `submitForm`.

## Cross-plugin use: getFormSummary

`wix-bookings` loads participant fields via `getFormSummary` — it does **not** use the contact-form UI on `/book`.

```typescript
import { getFormSummary } from '@jay-framework/wix-forms';
```

Flow: user selects a booking service → `getFormSummary({ formId: service.formId })` → user fills participant fields → `createBooking`.

## Config reference

`config/.wix-forms.yaml`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `defaultContactFormId` | string | Yes | Wix Forms form ID for the home page contact form |

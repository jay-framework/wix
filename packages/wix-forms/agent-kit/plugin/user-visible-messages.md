User-visible copy on Wix Forms pages (headless `form/<slug>` contracts).

## Who owns each string

| What visitors see | Source | Edited where |
| ----------------- | ------ | ------------ |
| Field **labels**, **placeholders**, select **option** labels | Wix Forms API (form schema) | **Wix dashboard** form builder — bind `{key.<target>.label}`, `{key.<target>.placeholder}`, option `{label}` |
| **Submit button** label | Page markup | **jay-html** — text inside `<button ref="key.submitButton">…</button>` (not read from Wix on the headless path) |
| **Success** after submit | Plugin sets English on `statusMessage` | **Not** in Wix dashboard. Control in **jay-html** (see below) |
| **Load failure** (`loadError`) | Plugin (`wix-form` component) | English defaults; customize display in jay-html or hide the binding |
| **Field validation** (`key.<target>.error`) | Plugin client validation + Wix API on submit | Message **templates** are English in the plugin; `{label}` inside messages comes from Wix |
| Layout, CSS, surrounding copy | Page | **jay-html** |

There is **no** setting in `config/.wix-forms.yaml` for success or validation message text today.

## `statusMessage` — success and generic submit errors

After a successful submit, the shared component sets `statusMessage` to the fixed English string `Form submitted successfully.` Failed submits (when errors are not mapped to a field) set `statusMessage` to plugin English or the raw error message.

**Wix does not expose** a post-submit “thank you” message to this plugin via the form-schema API.

### Recommended binding (English or default copy OK)

Show the plugin string when you are fine with English:

```html
<p class="form-status" if="contact.statusMessage">{contact.statusMessage}</p>
```

### Recommended binding (localized / custom thank-you)

Treat `statusMessage` as a **non-empty = submit succeeded or a form-level error** signal. Write the visible text in jay-html (one locale per page or route):

```html
<!-- Success: plugin sets statusMessage; you choose the words -->
<p class="success" if="contact.statusMessage">Thank you — we received your message.</p>

<!-- French page, same form bindings -->
<p class="success" if="contact.statusMessage">Merci — nous avons bien reçu votre message.</p>
```

Do **not** use `{contact.statusMessage}` for the thank-you line if you need non-English success text — that binding always includes the plugin’s English sentence on success.

To show **only** success and not generic error text in the same element, split concerns: e.g. success paragraph with `if="contact.statusMessage"` and static copy (errors already appear on `{key.field.error}` or a dedicated error region you design).

## `loadError`

When the form schema fails to load, `loadError` is set (e.g. `Could not load the form.`, permission-denied hints). Bind `{key.loadError}` if you want to show it, or use `if="contact.loadError"` with your own localized explanation.

## Field `{key.<target>.error}`

Client-side checks use English templates such as `Please enter a valid email address.` and `` `${label} is required.` `` (label from Wix). Server field violations use Wix’s `errorMessage` when present; otherwise the plugin may use `Invalid value`.

For multilingual sites, Wix-translated **labels** help required messages; format/validation sentences stay English unless you replace validation UX (custom submit flow) or the plugin gains i18n later.

## `getFormSummary` (bookings / participant fields)

`validateFormSummaryField` uses the same English validation patterns. That path is separate from the page `wixForm` UI; bookings integration is covered by the setup guide (`wix-forms-setup.md`) shipped in the `@jay-framework/wix-forms` package.

## Agent checklist

- **Change a field label** → Wix dashboard (see `agent-kit/references/wix-forms/wix-forms-dashboard-content.md`), keep `{key.field.label}` bindings.
- **Change thank-you / success text** → jay-html; use `if="key.statusMessage"` + static local copy, not `{key.statusMessage}` for localized success.
- **Change submit button text** → jay-html button content, not Wix.
- **Do not** hard-code field labels in jay-html when they should stay dashboard-managed.

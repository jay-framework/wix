# Wix Forms plugin — setup and troubleshooting

**Package:** `@jay-framework/wix-forms`

## Setup

1. Configure `@jay-framework/wix-server-client` (`config/.wix.yaml` with site ID and API key).
2. Run `jay-stack setup wix-forms` (optional `config/.wix-forms.yaml` filter — namespace / formIds / include).
3. Run `jay-stack agent-kit` so per-form contracts and `agent-kit/references/wix-forms/forms.yaml` are generated.
4. Enable **Wix Forms** on your API key ([API Keys](https://manage.wix.com/account/api-keys)).

Full walkthrough: `agent-kit/plugin/wix-forms-setup.md` and `agent-kit/plugin/per-form-contracts.md`. User-visible copy (success message, i18n, validation): `agent-kit/plugin/user-visible-messages.md`.

## Rendering forms on a page

Each Wix form uses its own headless script (`contract="form/<slug>"` from `forms.yaml`) and a page-local binding prefix (`key="…"`). A page may include **multiple** forms — one script per form, each with a **distinct** `key`.

There is no generic `wix-form` contract, no `formId` prop, and no `defaultFormId` in config.

## Bookings integration

`wix-bookings` loads participant fields via `getFormSummary` from this plugin (not the per-form page UI).

## Common errors

| Symptom | Fix |
| ------- | --- |
| 403 on form schema or submit | Add **Wix Forms** permission to API key |
| Console: `[wix-forms] No forms listed for namespace …` | Often normal before forms exist; else check `namespace`, `formIds`, `include` in `config/.wix-forms.yaml`, then re-run agent-kit |
| Validator: retired `contract="wix-form"` | Switch to `contract="form/<slug>"` from `forms.yaml` |
| Unknown field in bindings | Use field `target` names from `forms.yaml`; no `forEach` on a generic `fields` list |
| Form loads but no fields | Form has no supported input fields in Wix schema |

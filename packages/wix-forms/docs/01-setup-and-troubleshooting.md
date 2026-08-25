# Wix Forms plugin — setup and troubleshooting

**Package:** `@jay-framework/wix-forms`

## Setup

1. Run `jay-stack setup wix-forms`.
2. Set `defaultFormId` in `config/.wix-forms.yaml` (Wix Dashboard → Forms → form ID).
3. Enable **Wix Forms** on your API key (Dashboard → [API Keys](https://manage.wix.com/account/api-keys)).

## Rendering a form

Bind `<jay:wix-form>` with plugin `@jay-framework/wix-forms` / contract `wix-form`.

Pass `formId` to load a specific form, or omit it to use `defaultFormId` from config.

## Bookings integration

`wix-bookings` loads participant fields via `getFormSummary` from this plugin (no `wix-form` UI on booking pages).

## Common errors

| Symptom                      | Fix                                              |
| ---------------------------- | ------------------------------------------------ |
| 403 on form schema or submit | Add **Wix Forms** permission to API key          |
| "Form ID is missing"         | Set `defaultFormId` in `config/.wix-forms.yaml`  |
| Form loads but no fields     | Form has no supported input fields in Wix schema |

See also `agent-kit/plugin/wix-forms-setup.md` for full setup guide.

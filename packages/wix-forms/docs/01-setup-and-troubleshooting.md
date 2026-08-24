# Wix Forms plugin — setup and troubleshooting

**Package:** `@jay-framework/wix-forms`

## Setup

1. Run `jay-stack setup wix-forms`.
2. Set `defaultContactFormId` in `config/.wix-forms.yaml` (Wix Dashboard → Forms → form ID).
3. Enable **Wix Forms** on your API key (Dashboard → [API Keys](https://manage.wix.com/account/api-keys)).

## Home page

Bind `<jay:contact-form>` with plugin `@jay-framework/wix-forms` / contract `contact-form`.

## Bookings integration

`wix-bookings` loads participant fields via `getFormSummary` from this plugin (no contact-form UI on booking pages).

## Common errors

| Symptom                      | Fix                                                    |
| ---------------------------- | ------------------------------------------------------ |
| 403 on form schema or submit | Add **Wix Forms** permission to API key                |
| "Contact form ID is missing" | Set `defaultContactFormId` in `config/.wix-forms.yaml` |
| Form loads but no fields     | Form has no supported input fields in Wix schema       |

See also `agent-kit/plugin/wix-forms-setup.md` for full setup guide.

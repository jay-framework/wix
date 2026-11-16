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

`wix-bookings` loads participant fields with its own `wixBookings.getParticipantForm`, which reads the full schema through this plugin's `WixFormsService.getRawForm` (not the per-form page UI). `getFormSummary` is deprecated.

## Common errors

| Symptom                                                | Fix                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 403 on form schema or submit                           | Add **Wix Forms** permission to API key                                                                                          |
| Console: `[wix-forms] No forms listed for namespace …` | Often normal before forms exist; else check `namespace`, `formIds`, `include` in `config/.wix-forms.yaml`, then re-run agent-kit |
| Validator: retired `contract="wix-form"`               | Switch to `contract="form/<slug>"` from `forms.yaml`                                                                             |
| Unknown field in bindings                              | Use field `target` names from `forms.yaml`; no `forEach` on a generic `fields` list                                              |
| Form loads but no fields                               | Form has no supported input fields in Wix schema                                                                                 |
| `Could not load the address layouts. Please try again later.` | List Form Templates failed (network, API key). It retries after 30 s. Unset `WIX_FORMS_ADDRESS_TEMPLATES_ORIGIN` if it is set |
| A country shows region codes (Italy: `25`)            | Name them in `config/.wix-forms.yaml` `address.labels.subdivisions`                                                              |

## Address drift

The server logs, once per process per key:

```
[wix-forms] address drift: Wix rejected <target>/<part> (<rule>) for <country>; layout <templateId>. See "Address drift" in @jay-framework/wix-forms docs/01-setup-and-troubleshooting.md.
```

It means Wix answered differently from the plugin's country → layout map: Wix required a part the layout hid (the plugin shows it from then on, so the visitor can fix it), refused a part the layout shows, or rejected a code from a region list the template itself carries. No visitor value is logged.

What to do:

1. Run the L-drift probe (`scripts/address-map-probe.mjs`, see `wix-forms-setup.md` → Before release) against your QA probe form.
2. Report the country, part and rule from the log line, with the probe's diff, to the plugin maintainers.
3. If a visitor saw "This address cannot be accepted for <country>. Please contact us.", Wix needs a part outside the eight the plugin knows: only a plugin update fixes that.

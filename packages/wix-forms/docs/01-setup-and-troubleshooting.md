# Wix Forms — setup and troubleshooting

**Package:** `@jay-framework/wix-forms`

## Quick setup

1. Configure `config/.wix.yaml` (Wix site + API key with **Wix Forms** permission).
2. Run `jay-stack setup wix-server-client` then `jay-stack setup wix-forms`.
3. Run `jay-stack agent-kit` — materializes contracts and AIditor Add Menu items.

No `config/.wix-forms.yaml` — forms are **auto-fetched** from the Wix API.

## Page binding

Use a materialized contract from `agent-kit/plugins-index.yaml` or pick a form from AIditor **+ Add** / **@**:

```html
<script type="application/jay-headless"
  plugin="@jay-framework/wix-forms"
  contract="form/your-form-slug"
  key="myform">
</script>
```

Omit `formId` when using `contract="form/..."` — the plugin resolves the Wix form GUID from the site catalog.

## Bookings

`wix-bookings` loads participant fields via `getFormSummary` from this plugin (no form UI on booking pages).

## Troubleshooting

| Symptom                      | Fix                                                                 |
| ---------------------------- | ------------------------------------------------------------------- |
| Setup: no forms found        | Add forms in Wix dashboard; enable Wix Forms on API key             |
| 403 on load/submit           | Add **Wix Forms** permission to API key                             |
| Unknown contract             | Run `jay-stack agent-kit`                                         |
| Form missing from Add Menu   | Form has no usable fields in Wix; check form editor               |
| Contract not in autocomplete | Re-run `agent-kit`; confirm `wix-forms.generated.yaml` exists   |

See `agent-kit/plugin/wix-forms-setup.md` for full guide.

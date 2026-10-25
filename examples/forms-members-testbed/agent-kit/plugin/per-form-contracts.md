Per-form contracts for wix-forms (DL#38).

## One contract per form, with field-named tags

wix-forms no longer ships a single generic `wix-form` contract. Instead, **one
contract is generated per Wix form** during the agent-kit phase
(`jay-stack agent-kit`), with tags named after that form's real fields. This is
the same mechanism `wix-data` uses for collections.

- Forms are **auto-enumerated** from the site via the Wix List Forms API — there
  is no manual form list. `config/.wix-forms.yaml` only optionally filters
  (namespace / formIds / include); absent config, every enabled form is generated.
- Each form materializes as a contract named **`form/<slug>`**, where `<slug>` is
  the kebab-cased form name (e.g. `form/contact`). When two forms share a name,
  each gets a short id suffix (`form/contact-a1b2`, `form/contact-9f3c`).
- All per-form contracts are served by the one shared `wixForm` component, which
  reads `metadata.formId` to know which form to load. You never pick the component.

## Discover a form's fields

Run `jay-stack agent-kit`, then read:

- `agent-kit/references/wix-forms/forms.yaml` — every form, its `form/<slug>`
  contract name, and each field's `target`, `label`, `type`, `required`, and
  `elementType`.
- `agent-kit/materialized-contracts/wix-forms/form-<slug>.jay-contract` — the
  generated contract itself.

## Each field is a sub-contract named after its `target`

A field `email` becomes a `sub-contract` tag `email` carrying:

- `label` (data), `placeholder` (data, text-like fields only), `value`
  (text-like: data string; checkbox: variant boolean — DL#39), `required`
  (variant), `error` (data), `invalid` (variant — DL#39), one `input`
  interactive tag, and one `control` interactive tag (DL#39, custom UI).
- `input.elementType` is `HTMLInputElement` for text/email/tel/url and single
  checkboxes, `HTMLTextAreaElement` for multiline, `HTMLSelectElement` for
  choice (select / multiselect) fields.
- Choice fields expose a repeated `options` sub-contract (`value`, `label`); a
  **multiselect** adds a per-option `selected` variant (DL#39 — the array
  representation, since an array `dataType` is invalid).
- **Hidden** Wix fields (DL#39 4a) materialize a value+control channel only
  (no `label`/`placeholder`/`input`).

Form-level tags stay at the top level: `isLoading`, `loadError`, `isSubmitting`,
`isSubmitted` (DL#39), `statusMessage` (data/variant), `submitButton`,
`resetButton` (DL#39), and `honeypot` (DL#39) interactive tags.

> **Rich production forms** (confirmation/sent state, prefill, live validation,
> hidden/derived values, custom-UI/multi-step, honeypot, non-string fields) — see
> [`rich-forms.md`](./rich-forms.md).

## Binding is explicit

```html
<script type="application/jay-headless" plugin="@jay-framework/wix-forms"
        contract="form/contact" key="contact"></script>
<form>
  <label>{contact.firstName.label}
    <input ref="contact.firstName.input" placeholder="{contact.firstName.placeholder}" />
    <span class="error" if="contact.firstName.error">{contact.firstName.error}</span>
  </label>
  <label>{contact.country.label}
    <select ref="contact.country.input">
      <option forEach="contact.country.options" trackBy="value" value="{value}">{label}</option>
    </select>
  </label>
  <button ref="contact.submitButton">Send</button>
  <p if="contact.statusMessage">{contact.statusMessage}</p>
</form>
```

## The generic `fields` tag is gone

Never write `forEach="contact.fields"`, `{contact.fields...}`, or
`ref="contact.fields.formInputs"`. These bind the generic repeated array removed
in DL#38. The `wix-forms-bindings` validator flags leftover `.fields` bindings
and unknown field tags used as refs, with a migration message. There is no
`formId` prop and no `defaultFormId` — form identity is fixed by the contract.

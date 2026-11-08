Per-form contracts for wix-forms.

## One contract per form, with field-named tags

wix-forms generates **one contract per Wix form** during the agent-kit phase
(`jay-stack agent-kit`). Each contract exposes tags named after that form's real
fields — the same pattern `wix-data` uses for collections.

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
  (text-like: data string; checkbox: variant boolean), `required`
  (variant), `error` (data), `invalid` (variant), one `input`
  interactive tag, and one `control` interactive tag (custom UI).
- `input.elementType` is `HTMLInputElement` for text/email/tel/url and single
  checkboxes, `HTMLTextAreaElement` for multiline, `HTMLSelectElement` for
  choice (select / multiselect) fields.
- Choice fields expose a repeated `options` sub-contract (`value`, `label`); a
  **multiselect** adds a per-option `selected` variant (the array
  representation, since an array `dataType` is invalid).
- **Hidden** Wix fields materialize a value+control channel only
  (no `label`/`placeholder`/`input`).

Form-level tags stay at the top level: `isLoading`, `loadError`, `isSubmitting`,
`isSubmitted`, `statusMessage` (data/variant), `submitButton`,
`resetButton`, `honeypot`, and `confirmation` interactive tags.

> **Rich production forms** (confirmation/sent state, prefill, live validation,
> hidden/derived values, custom-UI/multi-step, honeypot, non-string fields, server-side
> submit hook) — see
> [`rich-forms.md`](./rich-forms.md).

See **`user-visible-messages.md`** for what copy comes from Wix vs the plugin,
how to customize success/thank-you text (including multilingual pages), and
how `loadError` / field `error` strings behave.

## Binding

**Contract slug vs script `key`.** `contract="form/<slug>"` selects the
generated contract (slug comes from Wix form names in `forms.yaml`). `key` is
only the binding prefix on that page (`{key.field…}`, `ref="key.field.input"`);
you choose it. One page may include several forms — one headless script per
form, each with its own `contract` and a **distinct** `key`.

Bind **explicit field tags** from the materialized contract — not a generic
fields array. The `wix-forms-bindings` validator rejects unknown field refs and
bindings that do not match the contract. Form identity is fixed by
`contract="form/<slug>"`; there is no `formId` prop and no `defaultFormId`.

```html
<script type="application/jay-headless" plugin="@jay-framework/wix-forms"
        contract="form/contact" key="contact"></script>
<form novalidate if="!contact.isSubmitted">
  <label for="firstName">{contact.firstName.label}</label>
  <input id="firstName" ref="contact.firstName.input" autocomplete="given-name"
         aria-required="{contact.firstName.required}" aria-describedby="firstName-error"
         placeholder="{contact.firstName.placeholder}" />
  <span id="firstName-error" class="error" aria-live="polite">{contact.firstName.error}</span>
  <label>{contact.country.label}
    <select ref="contact.country.input">
      <option forEach="contact.country.options" trackBy="value" value="{value}">{label}</option>
    </select>
  </label>
  <button ref="contact.submitButton">Send</button>
  <p class="form-error" if="contact.loadError">{contact.loadError}</p>
</form>
<!-- Success: gate on isSubmitted, never on statusMessage (it also carries errors) -->
<p if="contact.isSubmitted" ref="contact.confirmation" tabindex="-1">Thank you — we received your message.</p>
```

See `rich-forms.md` for the full accessible pattern (errors, status region, focus).

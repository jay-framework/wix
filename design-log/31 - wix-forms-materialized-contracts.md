# Design Log #31 — Wix Forms materialized contracts

## Status

**Approved — execution-ready (2026-08-31)**

Parent patterns: [wix-data #05](./05%20-%20wix-data%20plugin.md) (dynamic contracts per collection), [wix-stores #16](./16%20-%20product%20data%20extension%20fields.md) (extend static base at materialization). Jay: DL#60 dynamic contracts.

## Background

`@jay-framework/wix-forms` ships one static contract **`wix-form`** and one component implementation. At runtime the component loads a form schema from Wix by `formId` prop (or `config/.wix-forms.yaml` `defaultFormId`) and projects fields into ViewState.

That works for a single contact form but breaks agent and designer workflows:

- **AIditor Add Menu** needs per-form prompts with stable contract paths and field targets (see [wix #32](./32%20-%20wix-forms-add-menu-contribution.md)).
- **Jay validate** cannot lint bindings against field targets that only exist at runtime.
- **wix-bookings** already uses `getFormSummary` per service `formId` — forms are inherently plural on a site.

`wix-data` solves the plural-entity problem: one shared component, **one materialized contract per configured entity**. `wix-stores` **product-page** solves site-specific shape: **static base contract + generator appends site fields** — forms follow the product-page pattern, not wix-data top-level field tags.

## Problem

1. **Generic contract hides form-specific field targets** — agent-kit and validate cannot know `email`, `phone`, etc. until runtime.
2. **No discovery index** — unlike `agent-kit/references/wix-data/collections.yaml`, forms are not enumerated for agents.
3. **Config is a single `defaultFormId`** — no way to declare which site forms are in scope for Jay pages.
4. **Add Menu cannot reference per-form materialized paths** — blocked on materialization.

## Questions and Answers

**Q: List all forms from Wix automatically, or config-driven like wix-data collections?**
**A:** **Config-driven** (mirror wix-data). Site may have dozens of internal/booking forms. `config/.wix-forms.yaml` lists `forms[]` with `formId`, `visible`, optional `title` override. Setup/agent-kit materializes only configured visible entries.

**Q: Keep static `wix-form` contract for backward compatibility?**
**A:** **No** — experimental framework; migrate to materialized `form/<ContractName>` contracts. Remove `contract="wix-form"` from `plugin.yaml` static list.

**Q: One component or one component per form?**
**A:** **One component** (`wixForm`) + **dynamic contracts** in `plugin.yaml` (same as `productPage` / `collectionItem`).

**Q: Contract tag shape — top-level `{contact.email}` or keep `forEach="contact.fields"`?**
**A:** **Keep `fields` / `options` repeated sub-contracts** (Option A). Page bindings stay `forEach="contact.fields"` with `trackBy="target"`; refs stay `refs.fields?.formInputs` etc. Materialization adds a **`fieldCatalog`** repeated sub-contract (slow phase) with **one fixed row per Wix field** (`target`, `label`, `inputType`, `hasOptions`) so validate and agents know allowed targets. Runtime **`fields`** / **`options`** tags are still populated from the Wix API (values, options, submit) — same as today.

**Q: How are select fields (`options` sub-contract) materialized?**
**A:** `fieldCatalog` rows include `hasOptions: true` for select fields. **`options`** repeated sub-contract shape is unchanged; runtime still flattens select choices into `options` (see `flattenOptions` in `wix-form.ts`). Materialized contract does **not** enumerate individual option values (they can change in Wix without re-materialization).

**Q: `defaultFormId` vs `forms[]`?**
**A:**

| Field | Role |
| ----- | ---- |
| `forms[]` | **Authoritative** list for materialization, validate allow-list, and agent discovery |
| `defaultFormId` | Runtime fallback when headless `formId` prop is omitted; **must** match a visible `forms[]` entry |

**Migration:** On config load, if `forms[]` is empty and `defaultFormId` is set → auto-seed `forms: [{ formId: defaultFormId, visible: true }]`. Setup returns `needs-config` when there are **zero visible forms** after seeding.

**formId prop rule:** Must reference a `formId` present in `forms[]` with `visible: true`. Component logs a console warning and shows `loadError` if not (validate should catch at build time when contract + prop are known).

**Q: Contract naming algorithm?**
**A:** Deterministic function `formContractName(formId, title)`:

1. `baseTitle` = config `title` override → else Wix API form display name → else `Form`
2. `slug` = `toPascalCase(sanitizeIdentifier(baseTitle))` — strip non-alphanumeric, collapse spaces, PascalCase (same util family as wix-data `toPascalCase`)
3. `name` = `slug + 'Form'` (e.g. `ContactUsForm`)
4. **Collision:** if another visible form yields the same name, append `_` + first 8 hex chars of `formId` (dashes removed), e.g. `ContactUsForm_a1b2c3d4`
5. Dynamic contract key: `form/<name>` (e.g. `form/ContactUsForm`)

**Q: Where are contracts written?**
**A:** `agent-kit/materialized-contracts/wix-forms/form/<ContractName>.jay-contract`

## Design

### Contract shape (locked)

Materialized contract = **static base** (`lib/contracts/wix-form-base.jay-contract` — rename from `wix-form.jay-contract`) + **generator-appended `fieldCatalog`**.

| Tag | Phase | Source | Purpose |
| --- | ----- | ------ | ------- |
| `fieldCatalog` | slow | Materialized from Wix schema at agent-kit | Validate + agent field discovery |
| `fields` | fast+interactive | Runtime API (`WixFormsService.getFormFields`) | Rendered field rows |
| `options` | fast+interactive | Runtime API (flattened selects) | Select options |
| `isLoading`, `loadError`, `isSubmitting`, `statusMessage`, `fieldErrors`, `submitButton` | fast+interactive | Component | Unchanged |

Component TypeScript continues to import types from the **base** contract file; generator only changes per-site YAML (same pattern as `product-page.ts` + `productPageContractGenerator`).

### Config schema (`config/.wix-forms.yaml`)

```yaml
# Fallback when headless script omits formId — must match a visible forms[] entry
defaultFormId: ""

forms:
  - formId: "<guid>"
    visible: true
  - formId: "<other-guid>"
    visible: true
    title: "Newsletter signup" # optional — contract name + discovery title override
```

**Setup template** must include `forms: []` (not only `defaultFormId`).

### plugin.yaml

```yaml
dynamic_contracts:
  - prefix: form
    component: wixForm
    generator: formContractGenerator

# Remove static contracts: entry for wix-form after migration
```

### Generator (`lib/generators/form-contract-generator.ts`)

1. Load base YAML from `lib/contracts/wix-form-base.jay-contract`.
2. For each visible `forms[]` entry: call `WixFormsService.getFormFields(formId)` (uses existing projection).
3. Append `fieldCatalog` sub-contract with one row per projected field.
4. Set contract `name` via `formContractName(formId, title)`.
5. Return via `makeContractGenerator()` (mirror `product-page-contract-generator` / wix-data generators).

### `forms.yaml` reference schema

Written by `generateWixFormsAgentKit` to `agent-kit/references/wix-forms/forms.yaml`:

```yaml
_generated: "2026-08-31T12:00:00.000Z"
_description: Form schemas for agent discovery. Field targets match materialized fieldCatalog.
totalForms: 2
visibleForms: 2
forms:
  - formId: "<guid>"
    contractName: ContactUsForm # PascalCase name without form/ prefix
    title: "Contact us"
    materializedContractPath: agent-kit/materialized-contracts/wix-forms/form/ContactUsForm.jay-contract
    fields:
      - target: email
        label: Email
        inputType: email
        required: true
        hasOptions: false
      - target: message
        label: Message
        inputType: textarea
        required: false
        hasOptions: false
```

### agentkit handler (`generateWixFormsAgentKit`)

- Write `forms.yaml` (schema above).
- Trigger contract materialization (shared with setup path).
- **Do not** write Add Menu yaml — see DL#32.

### Component changes (`wix-form.ts`) — minimal

| Change | Detail |
| ------ | ------ |
| Dynamic contract resolution | Resolve `form/<ContractName>` from headless script `contract` attribute |
| `fieldCatalog` slow phase | Emit materialized catalog rows in slow phase (from contract, not API) |
| Runtime fetch | **Keep** `getFormFields()` for `fields` / `options` fast phase — submit, validation, option labels |
| Allow-list | Warn when `formId` prop not in config `forms[]` |
| Types | Still import from `wix-form-base.jay-contract.d.ts` |

**No refactor** to top-level per-field tags or `{contact.email}` bindings.

### Blast radius

| Area | Files / consumers |
| ---- | ----------------- |
| wix-forms package | ~8–10 files: `plugin.yaml`, `setup.ts`, `config-loader.ts`, generator, agentkit, `wix-form.ts`, base contract rename, tests, docs |
| Examples | **No existing page** — add minimal `examples/cms/src/pages/contact/page.jay-html` (or package integration fixture) |
| wix-bookings | 0 — still uses `getFormSummary` |
| jay core | 0 |
| jay-aiditor | 0 in this task; DL#32 blocked until complete |

## Examples

### Materialized contract excerpt (`ContactUsForm`)

```yaml
name: ContactUsForm
description: Wix form Contact us (formId a1b2c3d4-…)

props:
  - name: formId
    type: string
    description: Must match configured formId in config/.wix-forms.yaml

tags:
  # … base tags: fields, options, isLoading, loadError, isSubmitting, statusMessage, fieldErrors, submitButton …

  - tag: fieldCatalog
    type: sub-contract
    repeated: true
    trackBy: target
    phase: slow
    description: Materialized field targets for validate and agent discovery
    tags:
      - { tag: target, type: data, dataType: string }
      - { tag: label, type: data, dataType: string }
      - { tag: inputType, type: data, dataType: string }
      - { tag: required, type: data, dataType: boolean }
      - { tag: hasOptions, type: variant, dataType: boolean }
    # Generator emits fixed rows, e.g. target email, target message — see fixture tests
```

### jay-html (unchanged binding style)

```html
<script type="application/jay-headless"
  plugin="@jay-framework/wix-forms"
  contract="form/ContactUsForm"
  key="contact">
</script>

<jay:contact-form>
  <form if="contact.fields.length">
    <div forEach="contact.fields" trackBy="target">
      <label>{field.label}</label>
      <input if="!field.isTextarea && !field.hasOptions"
        ref="field.formInputs" type="{field.inputType}" />
      <textarea if="field.isTextarea" ref="field.formTextareas"></textarea>
      <select if="field.hasOptions" ref="field.formSelects">
        <option forEach="contact.options" trackBy="id"
          if="option.fieldTarget === field.target"
          value="{option.value}">{option.label}</option>
      </select>
    </div>
    <button ref="contact.submitButton">Send</button>
  </form>
</jay:contact-form>
```

### Patterns

✅ **Good:** `contract="form/ContactUsForm"` + `forEach="contact.fields"` + `field.target` in catalog  
✅ **Good:** `formId` prop omitted when `defaultFormId` matches configured form  
❌ **Bad:** `contract="wix-form"` (removed)  
❌ **Bad:** `formId` prop pointing at a form not listed in `forms[]`  
❌ **Bad:** `{contact.email}` top-level binding (not this contract shape)

## Implementation Plan

### Phase 1 — Config + base contract

1. Rename `wix-form.jay-contract` → `wix-form-base.jay-contract`; add `fieldCatalog` tag definition to base.
2. Extend `WixFormsConfig` + loader with `forms[]`; auto-seed from `defaultFormId`; update setup template.
3. Implement `formContractName()` + tests (collisions, sanitization).

### Phase 2 — Generator

1. `formContractGenerator` + fixture tests (`test/fixtures/form-contract-generator/`).
2. Add `dynamic_contracts` to `plugin.yaml`; remove static `wix-form` contract entry.

### Phase 3 — agentkit + component

1. `generateWixFormsAgentKit` → `forms.yaml`.
2. Component: dynamic contract resolution + slow-phase `fieldCatalog`.
3. Add minimal example page (cms contact page or package fixture).

### Phase 4 — Docs

1. Update `wix-forms-setup.md`.
2. Cross-link DL#32.

## Trade-offs

| Choice | Gain | Cost |
| ------ | ---- | ---- |
| Option A (`fields` + `fieldCatalog`) vs top-level field tags | Minimal component change; existing jay-html pattern | Validate lints catalog targets, not `{contact.email}` sugar |
| Config-driven `forms[]` | Predictable materialization | User must configure forms (auto-seed eases migration) |
| Runtime API fetch retained | Correct option values + schema drift tolerance | Duplicate field list (catalog vs API) — catalog is superset for lint |
| Remove generic `wix-form` | Single mental model | Breaking change |

## Verification Criteria

- [ ] `jay-stack setup wix-forms` with two visible forms → two files under `agent-kit/materialized-contracts/wix-forms/form/`
- [ ] Materialized `ContactUsForm.jay-contract` contains `fieldCatalog` rows with targets `email`, `message` (fixture-driven)
- [ ] `jay-stack validate` passes on example page using `forEach="contact.fields"` + `contract="form/ContactUsForm"`
- [ ] `jay-stack validate` fails when jay-html references a `field.target` not in materialized `fieldCatalog`
- [ ] Config with only `defaultFormId` (no `forms[]`) → auto-seeds one visible form and materializes one contract
- [ ] Two forms with same Wix title → distinct contract names via `formId` suffix
- [ ] Re-run `jay-stack agent-kit` after Wix schema change updates `fieldCatalog` and `forms.yaml`
- [ ] Package tests: generator fixtures; no import of `@jay-framework/aiditor`

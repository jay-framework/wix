# Design Log #31 — Wix Forms materialized contracts

## Status

**Draft — architect scoping (2026-08-31)**

Parent patterns: [wix-data #05](./05%20-%20wix-data%20plugin.md) (dynamic contracts per collection), [wix-stores #16](./16%20-%20product%20data%20extension%20fields.md) (setup-time materialization). Jay: DL#60 dynamic contracts.

## Background

`@jay-framework/wix-forms` ships one static contract **`wix-form`** and one component implementation. At runtime the component loads a form schema from Wix by `formId` prop (or `config/.wix-forms.yaml` `defaultFormId`) and projects fields into ViewState.

That works for a single contact form but breaks agent and designer workflows:

- **AIditor Add Menu** needs per-form prompts with stable contract paths and field tags (see [wix #32](./32%20-%20wix-forms-add-menu-contribution.md)).
- **Jay validate** cannot lint bindings against fields that only exist at runtime.
- **wix-bookings** already uses `getFormSummary` per service `formId` — forms are inherently plural on a site.

`wix-data` solves the same shape problem: one shared component, **one materialized contract per configured entity**, generated from live Wix schema at `jay-stack setup` / `jay-stack agent-kit`.

## Problem

1. **Generic contract hides form-specific fields** — agent-kit and AIditor cannot list `email`, `phone`, etc. until runtime.
2. **No discovery index** — unlike `agent-kit/references/wix-data/collections.yaml`, forms are not enumerated for agents.
3. **Config is a single `defaultFormId`** — no way to declare which site forms are in scope for Jay pages.
4. **Add Menu cannot reference per-form materialized paths** — blocked on materialization.

## Questions and Answers

**Q: List all forms from Wix automatically, or config-driven like wix-data collections?**
**A:** **Config-driven** (mirror wix-data). Site may have dozens of internal/booking forms. `config/.wix-forms.yaml` lists `forms[]` with `formId`, `visible`, optional `title` override. Setup/agent-kit materializes only configured entries. Optional future: setup prompt to pick forms from API list (DL#27 interactive setup).

**Q: Keep static `wix-form` contract for backward compatibility?**
**A:** **No** — experimental framework; migrate examples to materialized `form/<Name>Form` contracts. Deprecate script `contract="wix-form"` in agent-kit docs; generator emits typed names from Wix form display name + id slug.

**Q: One component or one component per form?**
**A:** **One component** (`wixForm`) + **dynamic contracts** in `plugin.yaml` (same as `collectionItem` / `collectionList`).

**Q: What tags does each materialized contract include?**
**A:** Base tags from current `wix-form.jay-contract` (loading, submit, errors) **plus** one sub-contract row per supported input field from Wix schema (`target`, `label`, `inputType`, `required`, variants for textarea/options). Field list is fixed at materialization time from `getFormSchema`.

**Q: Where are contracts written?**
**A:** `agent-kit/materialized-contracts/wix-forms/form/<ContractName>.jay-contract` — same tree jay-stack uses for wix-stores `product-page` and wix-data collection contracts.

## Design

### Config schema (`config/.wix-forms.yaml`)

```yaml
defaultFormId: "<guid>" # fallback when page omits formId prop

forms:
  - formId: "<guid>"
    visible: true
    # optional display override for contract name / Add Menu title
    title: "Contact us"
```

### plugin.yaml

```yaml
dynamic_contracts:
  - prefix: form
    component: wixForm
    generator: formContractGenerator
```

### Generator (`lib/generators/form-contract-generator.ts`)

1. Read `forms[]` from config (skip `visible: false`).
2. For each entry: `getFormSchema(wixClient, formId)` → `projectFormFields` (existing util).
3. Emit contract YAML: name `form/<PascalCaseTitle>Form`, tags for each field + shared submit/error tags.
4. Register with `DYNAMIC_CONTRACT_SERVICE` (existing wix-data pattern).

### agentkit handler (`generateWixFormsAgentKit`)

- Write `agent-kit/references/wix-forms/forms.yaml` — formId, title, field summaries (for agent discovery).
- Re-run materialization (or delegate to shared setup path) so references and contracts stay in sync.
- **Do not** write Add Menu yaml here — see DL#32 (setup template + generated items).

### Component change (`wix-form.ts`)

- Resolve contract via dynamic contract service (form id from props or config).
- Remove reliance on fully runtime field projection where materialized tags exist; keep runtime fetch for values/submit only.

### Blast radius

| Area | Files / consumers |
| ---- | ----------------- |
| wix-forms package | `plugin.yaml`, `setup.ts`, new generator + agentkit, `wix-form.ts`, config types |
| Examples using `wix-form` | `examples/cms`, any starter pages — update script contract names |
| wix-bookings | Unchanged — still uses `getFormSummary` action, not `wix-form` UI |
| jay-aiditor | No core changes; Add Menu items reference materialized paths (DL#32) |

## Implementation Plan

### Phase 1 — Generator + config

1. Extend `WixFormsConfig` + loader with `forms[]`.
2. Implement `formContractGenerator` + tests with fixture schemas.
3. Add `dynamic_contracts` to `plugin.yaml`.
4. Migration: update package tests and one example page.

### Phase 2 — agentkit references

1. Add `agentkit: generateWixFormsAgentKit` to `plugin.yaml`.
2. Emit `forms.yaml` reference file.
3. Setup validates at least one visible form or returns `needs-config`.

### Phase 3 — Docs

1. Update `wix-forms-setup.md` and troubleshooting.
2. Cross-link DL#32 Add Menu contributor.

## Trade-offs

| Choice | Gain | Cost |
| ------ | ---- | ---- |
| Config-driven vs auto-list all forms | Predictable materialization, smaller agent-kit | User must add forms to config |
| Materialized field tags vs runtime-only | Validate + Add Menu + agent readability | Re-run agent-kit when Wix form schema changes |
| Remove generic `wix-form` | Single mental model | Breaking change for early adopters |

## Verification Criteria

- [ ] `jay-stack setup wix-forms` with two forms in config → two files under `agent-kit/materialized-contracts/wix-forms/form/`
- [ ] `jay-stack validate` on a page binding `{contact.email}` passes when `contact` uses materialized Contact form contract
- [ ] Changing a field in Wix + re-run `jay-stack agent-kit` updates contract tags
- [ ] `forms.yaml` lists same forms with field summaries
- [ ] Package tests: generator fixtures, no import of `@jay-framework/aiditor`

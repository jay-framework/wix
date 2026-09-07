# Design Log #33 — wix-forms Add Menu contribution

## Status

**Approved — execution-ready (2026-09-07)** — auto-fetch revision aligned with [DL#32](./32%20-%20wix-forms-materialized-contracts.md).

**Depends on:** [DL#32](./32%20-%20wix-forms-materialized-contracts.md) (materialized contract paths).

## Background

AIditor **+ Add** and **@ autocomplete** consume `agent-kit/aiditor/add-menu/*.yaml`. wix-forms must contribute one **stage-place** item per site form with a prompt that includes materialized contract path and working form jay-html (fields + submit).

Forms are discovered from the **Wix API** at init — no manual config.

## Problem

1. No Add Menu entries for Wix Forms — agent does not receive form binding instructions.
2. Per-form items need **materialized contract paths** (DL#32), not `node_modules/.../wix-form.jay-contract`.
3. Optional **Project settings tab** — picking which forms to materialize is easier in UI than hand-editing config (defer if API-driven discovery is enough for v1).

## Questions and Answers

**Q: Static template item for generic `wix-form`?**
**A:** **No** after DL#32 — only **generated** items per site form. No static `wix-forms.yaml` in v1 unless we need a single “Forms setup help” reference item (out of scope).

**Q: Generated file name?**
**A:** `agent-kit/aiditor/add-menu/wix-forms.generated.yaml` — never overwrite hand-authored yaml.

**Q: Item shape per form?**
**A:** See generated catalog table below.

## Design

### Generated catalog

**File:** `agent-kit/aiditor/add-menu/wix-forms.generated.yaml` (never hand-edited)

| Field | Value |
| ----- | ----- |
| `id` | `wix-forms:form:{formId}` |
| `category` | `Forms` |
| `subCategory` | `Site forms` |
| `title` | Wix form display name |
| `interaction.mode` | `stage-place` |
| `prompt` | formId, materialized contract path, script key, full jay-html snippet |

### agentkit handler

1. Read site catalog from `WixFormsService` (populated at init from Wix API).
2. Write `wix-forms.generated.yaml` via `buildFormAddMenuItems`.
3. Copy thumbnail `agent-kit/aiditor/thumbnails/wix-forms/form.svg` → `public/aiditor-add-menu-thumbnails/wix-forms/`.

Prompt template includes:

- `Read agent-kit/materialized-contracts/wix-forms/form-<slug>.jay-contract`
- `formId: {formId}` prop on headless script
- `submitForm` / field binding notes

### AIditor autocomplete

No separate reference file. **@ mentions** use the same Add Menu catalog as **+ Add** (`listAddMenuItems` in aiditor).

## Verification Criteria

- [x] Project with wix-forms + agent-kit → Add Menu **Forms** category with one item per site form
- [x] Item prompt includes materialized contract path + forEach fields jay-html + submitButton ref
- [x] `interaction.mode: stage-place` for marker placement
- [ ] Dogfood: attach form item in AIditor → agent receives full binding instructions
- [ ] Re-run agent-kit after new Wix form → new Add Menu item without manual yaml edit

## Implementation Results

**Completed:** 2026-09-07 (with DL#32 auto-fetch revision)

- `lib/add-menu/form-items.ts` — prompt builder with full form UI snippet
- `generateWixFormsAgentKit` writes generated catalog + copies thumbnails
- Tests: `test/form-add-menu.test.ts`, `test/agentkit.test.ts`

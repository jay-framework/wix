# Design Log #32 — wix-forms Add Menu contribution

## Status

**Draft — architect scoping (2026-08-31)**

**Depends on:** [DL#31](./31%20-%20wix-forms-materialized-contracts.md) (materialized contract paths). **Parent:** [jay-aiditor #19](../../jay-aiditor/design-log/19%20-%20aiditor-add-menu.md). **Settings pattern:** [jay-aiditor #33](../../jay-aiditor/design-log/33%20-%20aiditor-plugin-settings-tabs.md).

## Background

wix-stores contributes Add Menu via `agent-kit/aiditor/add-menu/wix-stores.yaml` (static components) + `wix-stores.generated.yaml` (per-category items). wix-forms has no Add Menu contributor today; users cannot attach form context from AIditor Add Page or Change Request.

Forms are **site-specific** and **plural** — prompts must name the form id, materialized contract path, and script key.

## Problem

1. No Add Menu entries for Wix Forms — agent does not receive form binding instructions.
2. Per-form items need **materialized contract paths** (DL#31), not `node_modules/.../wix-form.jay-contract`.
3. Optional **Project settings tab** — picking which forms to materialize is easier in UI than hand-editing `forms[]` in yaml (aligns with #33; defer if config-only is enough for v1).

## Questions and Answers

**Q: Static template item for generic `wix-form`?**
**A:** **No** after DL#31 — only **generated** items per configured visible form. No static `wix-forms.yaml` in v1 unless we need a single “Forms setup help” reference item (out of scope).

**Q: Generated file name?**
**A:** `agent-kit/aiditor/add-menu/wix-forms.generated.yaml` — never overwrite hand-authored yaml.

**Q: Item shape per form?**
**A:**

| Field | Value |
| ----- | ----- |
| `id` | `wix-forms:form:{formId}` |
| `category` | `Forms` |
| `subCategory` | `Components` (or form title if single subCategory is too flat) |
| `title` | Form display name from Wix or config override |
| `interaction.mode` | `stage-place` |
| `prompt` | formId, materialized contract path, suggested script key, submitForm action hint |

**Q: Project settings tab in v1?**
**A:** **Recommended but optional for v1.** Minimum: config yaml + setup message. **v1.5:** `agent-kit/aiditor/settings/wix-forms.yaml` + devOnly route — checklist (API key permissions), link to Wix Dashboard → Forms, read-only list of configured forms, CTA to re-run agent-kit. **No secrets in browser** (#33).

**Q: Cross-repo tests?**
**A:** Same as wix-stores DL#20 — shape tests in wix repo only; canonical fixture `jay-aiditor/.../add-menu/valid-item.yaml` copied into test helper.

## Design

### Setup (`setupWixForms`)

- After config valid: no static add-menu write in setup (generated only).
- Existing: create `config/.wix-forms.yaml` template.

### agentkit handler

1. Ensure DL#31 materialization ran (forms + contracts exist).
2. For each visible form in config, fetch title/summary from Wix (or cache from `forms.yaml`).
3. Write `wix-forms.generated.yaml` with one item per form.
4. Prompt template includes:
   - `Read agent-kit/materialized-contracts/wix-forms/form/<Name>Form.jay-contract`
   - `formId: {formId}` prop on `<jay:...>` or headless script
   - `submitForm` / field binding notes

### Settings tab (optional v1.5)

- `settings.template.yaml` → materialize `agent-kit/aiditor/settings/wix-forms.yaml`
- Route: `/wix-forms/settings` (`devOnly: true`)
- Iframe: onboarding copy, permission checklist, “Re-run agent-kit” postMessage (`aiditor:addMenuCatalogChanged`)

### Blast radius

| Package | Change |
| ------- | ------ |
| wix-forms | agentkit handler, optional settings route + page |
| jay-aiditor | None required — consumes yaml like other plugins |
| examples | Dogfood: install wix-forms, run agent-kit, verify Add Menu |

## Implementation Plan

| ID | Task | Priority |
| -- | ---- | -------- |
| F1 | agentkit: write `wix-forms.generated.yaml` | P0 |
| F2 | Tests: yaml shape + prompt contains materialized path | P0 |
| F3 | Settings tab + route (optional) | P1 |
| F4 | Thumbnails per form (generic svg fallback) | P2 |

## Trade-offs

- **Generated-only catalog** — simpler than static+generated split; empty until forms configured.
- **Defer settings UI** — ships faster; power users edit yaml.

## Verification Criteria

- [ ] Project with wix-forms configured → Add Menu shows **Forms** category with one item per visible form
- [ ] Attach item → agent prompt includes materialized contract path + formId
- [ ] Uninstalled wix-forms → items hidden (AIditor package.json filter)
- [ ] Re-run agent-kit after adding form in config → new item appears without manual yaml edit

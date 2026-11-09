# 39 — Materialized contract editing guides (wix-data)

**Status:** [Implemented] — final shape **2026-11-04** (per-contract stub files were shipped on 2026-11-03 then **removed**; see [Implementation Results](#implementation-results)).

## Decisions for the Implementer (TL;DR)

**Read this section only** for how the code works today.

1. **Option B.** `collectionId` and `editingGuide` live on each **materialized** `.jay-contract` YAML (top-level fields). **`plugins-index.yaml` is unchanged** (no `editingGuide` column).
2. **No Jay framework changes.** Generators emit extra YAML lines; Jay’s materializer writes them as today.
3. **No AIditor prompt injection (in this log).** Agents resolve: inspector `stack` contract name → `plugins-index` `path` → read `.jay-contract` → read `editingGuide` markdown.
4. **`collectionId`** on the contract is authoritative for which Wix CMS collection applies — **never derive it from the contract name.**
5. **`editingGuide`** on every materialized wix-data contract is the **same** project-root path: `agent-kit/references/wix-data/wix-data-dashboard-content.md` (the shared CMS procedure, copied from the plugin on `jay-stack agent-kit`). Same pattern as wix-stores generated `product-page` pointing at one dashboard guide — **no** `editing-guides/` stub files.
6. **Static wix plugins** may add the same top-level fields on hand-authored `.jay-contract` files later; this log implements **wix-data dynamic** contracts only.

## Background

Design Log #38 added dashboard URL guidance for plugin-bound content. Dynamic wix-data contracts cannot declare `editingGuide` in `plugin.yaml`. QA showed agents often skip optional agent-kit docs unless a **machine-readable pointer** exists on the contract they resolve.

## Problem

When a user asks to change bound CMS data (e.g. an image on a list item), the agent must know:

- Not to edit jay-html bindings in place.
- Which **Wix CMS collection** and **item** apply.
- Which **markdown guide** defines the steps (dashboard link, field from source lines, optional writes).

Today only `plugins-index.metadata.collectionId` hints at the collection; there is no `editingGuide` on the materialized contract file.

## Prior Art

- DL#219 — `editingGuide` on `plugin.yaml` static contracts; deferred surfacing in `plugins-index`.
- DL#38 — shared `wix-data-dashboard-content.md`; `getDashboardUrl`; no per-dynamic-contract manifest entries.
- Jay `contract-materializer` — writes `generated.yaml` verbatim; adds `metadata` to index only.

## Implemented behavior (2026-11-04)

### Materialized `.jay-contract` header (generated)

```yaml
name: RecipesList
description: List page for Recipes
collectionId: Recipes
editingGuide: agent-kit/references/wix-data/wix-data-dashboard-content.md
tags: ...
```

- `collectionId` — Wix Data collection `_id` (same value as `plugins-index.metadata.collectionId`).
- `editingGuide` — always the shared CMS guide under `agent-kit/references/wix-data/` (not per-contract paths).

### Agent workflow

1. Source-editing marker → `stack` region `name` (e.g. `list/recipes-list`) or wix-data page script contract.
2. `agent-kit/plugins-index.yaml` → `path` for that contract name.
3. Read `.jay-contract` → `collectionId`, `editingGuide`.
4. Open **`editingGuide`** (the shared procedure) and follow it using **`collectionId`** from the same file.

### Code (wix-data package)

| File                                               | Role                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `lib/source-editing.ts`                            | `SHARED_EDITING_GUIDE_PATH`, `sourceEditingContractHeader(collectionId)`, copy shared guide into references  |
| `lib/generators/*-contract-generator.ts`           | Insert `collectionId` + `editingGuide` in `buildContract()`                                                  |
| `lib/setup.ts` `generateWixDataAgentKit`           | Write `collections.yaml`; copy shared guide to `agent-kit/references/wix-data/wix-data-dashboard-content.md` |
| `agent-kit/designer/wix-data-dashboard-content.md` | Lookup workflow + CMS steps (source of copy in references)                                                   |

### Verification (current)

- [x] Materialized wix-data `.jay-contract` files include `collectionId` and `editingGuide`.
- [x] Every contract’s `editingGuide` equals `agent-kit/references/wix-data/wix-data-dashboard-content.md`.
- [x] `jay-stack agent-kit` copies the shared guide (no `editing-guides/` directory).
- [x] `npm run validate` in `wix-data` passes; `test/source-editing.test.ts` covers header YAML.

**Regenerate in a project:** `jay-stack agent-kit` (shared guide copy), then re-materialize dynamic contracts so `.jay-contract` headers update.

---

## Superseded initial design (2026-11-03 — do not implement)

The first implementation used **per-contract stub markdown** under `agent-kit/references/wix-data/editing-guides/` (`list-recipes-list.md`, etc.). Each stub repeated `collectionId` and linked to the shared guide. After review we dropped that layer: `collectionId` on the `.jay-contract` is enough, and all contracts share one guide path (less agent-kit noise, matches wix-stores).

<details>
<summary>Original Design section (historical)</summary>

### Materialized header (initial)

```yaml
editingGuide: agent-kit/references/wix-data/editing-guides/list-recipes-list.md
```

- `editingGuide` was a **per-contract stub** path (`prefix` + kebab of generator name).

### Agent workflow (initial)

4. Read `editingGuide` stub → follow link to shared `wix-data-dashboard-content.md`.

### Stub file (initial)

Generated at agent-kit: small markdown per visible collection × component kind, linking to `../wix-data-dashboard-content.md`.

### Trade-offs (initial)

- Stub per contract — extra files; intended to name collection without re-reading contract YAML (redundant once `collectionId` lives on the contract).

### Verification (initial)

- Stubs created under `editing-guides/`; stub path matched `editingGuide` on each contract.

</details>

## Implementation Plan

1. Add `lib/source-editing.ts` + unit tests (node).
2. Wire four contract generators.
3. Extend `generateWixDataAgentKit`.
4. Update designer guide copy.
5. Append Implementation Results after verify.

_(Plan followed; step 3 later simplified — no stubs.)_

## Implementation Results

**2026-11-03 — First ship (later superseded for stubs only).**

- Added `lib/source-editing.ts` with `sourceEditingContractHeader()`, stub writers, shared guide copy.
- All four contract generators emit `collectionId` + `editingGuide` in materialized YAML.
- `generateWixDataAgentKit` wrote per-contract stubs under `editing-guides/` and copied the shared designer guide.
- Updated designer guide: contract-file lookup workflow.
- Tests and `validate-plugin` passed.

**2026-11-04 — Final shape: shared `editingGuide` only.**

- **Decision:** Drop per-contract stubs; point every materialized contract’s `editingGuide` at `agent-kit/references/wix-data/wix-data-dashboard-content.md`. Rationale: stubs duplicated `collectionId` already on the contract and only forwarded to the shared doc (same model as wix-stores `product-page`).
- **Code:** Removed stub generation and kebab path helpers from `source-editing.ts`; `sourceEditingContractHeader(collectionId)` only; generators and setup updated; designer guide step 3 opens `editingGuide` directly.
- **Tests:** `test/source-editing.test.ts` — header + YAML quoting (2 tests). `npm run build` + `validate-plugin` pass.
- **Projects:** Re-run `jay-stack agent-kit` and re-materialize wix-data contracts; delete leftover `editing-guides/` if present.

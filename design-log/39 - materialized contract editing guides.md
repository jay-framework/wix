# 39 — Materialized contract editing guides (wix-data)

**Status:** [Implemented]

## Decisions for the Implementer (TL;DR)

1. **Option B.** `collectionId` and `editingGuide` live on each **materialized** `.jay-contract` YAML (top-level fields). **`plugins-index.yaml` is unchanged** (no `editingGuide` column).
2. **No Jay framework changes.** Generators emit extra YAML lines; Jay’s materializer writes them as today.
3. **No AIditor prompt injection.** Agents resolve: inspector `stack` contract name → `plugins-index` `path` → read `.jay-contract` → read `editingGuide` markdown.
4. **`editingGuide` is always a project-root-relative path** to a markdown file under `agent-kit/references/wix-data/`.
5. **Per-contract stub** (`editing-guides/<prefix>-<kebab>.md`) points at one **shared** procedure doc copied to `agent-kit/references/wix-data/wix-data-dashboard-content.md`.
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

## Design

### Materialized `.jay-contract` header (generated)

```yaml
name: RecipesList
description: List page for Recipes
collectionId: Recipes
editingGuide: agent-kit/references/wix-data/editing-guides/list-recipes-list.md
tags:
  ...
```

- `collectionId` — Wix Data collection `_id` (same value as `plugins-index.metadata.collectionId`).
- `editingGuide` — path from **project root** to the stub for contract `list/recipes-list` (`prefix` + kebab of generator `name`, matching Jay materializer naming).

### Agent workflow

1. Source-editing marker → `stack` region `name` (e.g. `list/recipes-list`) or wix-data page script contract.
2. `agent-kit/plugins-index.yaml` → `path` for that contract name.
3. Read `.jay-contract` → `collectionId`, `editingGuide`.
4. Read `editingGuide` stub → follow link to shared `wix-data-dashboard-content.md`.

### Stub file (generated at `jay-stack agent-kit`)

`agent-kit/references/wix-data/editing-guides/list-recipes-list.md`:

- States materialized contract id and collection id.
- Links to `../wix-data-dashboard-content.md`.

Shared guide is **copied** from the plugin package into `agent-kit/references/wix-data/wix-data-dashboard-content.md` on each agent-kit run (project-local, stable path).

### Code (wix-data package)

| File | Role |
|------|------|
| `lib/source-editing.ts` | Kebab naming (match Jay materializer), paths, YAML header lines, stub markdown |
| `lib/generators/*-contract-generator.ts` | Insert header fields in `buildContract()` |
| `lib/setup.ts` `generateWixDataAgentKit` | Copy shared guide; write stubs per visible collection × enabled component kinds |
| `agent-kit/designer/wix-data-dashboard-content.md` | Prefer `collectionId` / `editingGuide` on contract file |

## Implementation Plan

1. Add `lib/source-editing.ts` + unit tests (node).
2. Wire four contract generators.
3. Extend `generateWixDataAgentKit`.
4. Update designer guide copy.
5. Append Implementation Results after verify.

## Trade-offs

- **Stub per contract** — more files under `agent-kit/references/`; agents open a small file that names the collection without re-reading the index.
- **No index `editingGuide`** — one extra read (open `.jay-contract`); matches user choice and avoids Jay changes.
- **Discovery still conventional** — without AIditor injection, agent-kit docs must state the 4-step workflow.

## Verification Criteria

- [x] Materialized wix-data `.jay-contract` files include `collectionId` and `editingGuide`.
- [x] `jay-stack agent-kit` creates stubs and shared guide copy under `agent-kit/references/wix-data/`.
- [x] Stub path matches `editingGuide` on the contract for the same collection/prefix.
- [x] `npm run validate` in `wix-data` passes.

## Implementation Results

**2026-11-03** — wix-data only; no Jay changes; `plugins-index` unchanged.

- Added `lib/source-editing.ts`: kebab naming (matches Jay materializer), `sourceEditingContractHeader()`, stub writer, shared guide copy into `agent-kit/references/wix-data/wix-data-dashboard-content.md`.
- All four contract generators emit `collectionId` + `editingGuide` in materialized YAML.
- `generateWixDataAgentKit` writes per-contract stubs under `agent-kit/references/wix-data/editing-guides/` and copies the shared designer guide into references.
- Updated `agent-kit/designer/wix-data-dashboard-content.md`: contract-file lookup workflow, CMS field step from `node.lines`.
- Tests: `test/source-editing.test.ts` (4/4 pass). `npm run build` + `validate-plugin` pass.

**Regenerate in a project:** `jay-stack agent-kit` (stubs + shared copy), then materialize dynamic contracts (setup/agent-kit pipeline) so `.jay-contract` files pick up new headers.

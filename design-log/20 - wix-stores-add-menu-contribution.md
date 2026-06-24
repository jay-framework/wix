# Design Log #20 — wix-stores Add Menu contribution

## Status

**Execution-ready** — architect review addressed. Parent: [jay-aiditor #19](../jay-aiditor/design-log/19%20-%20aiditor-add-menu.md). AIditor tasks: [implementation plan](../jay-aiditor/design-log/19%20-%20aiditor-add-menu-implementation-plan.md).

**Out of scope:** wix-media ([#19](./19%20-%20wix-media-plugin.md)), wix-stores-v1 parity.

### Generated category items (M19.2 — implemented)

On `jay-stack agent-kit` (references handler), wix-stores writes:

`<project>/agent-kit/aiditor/add-menu/wix-stores.generated.yaml`

One item per visible category from the indexed tree (`agent-kit/references/wix-stores/categories.yaml`). Each item:

- `category: Store`, `subCategory: Categories`
- `id`: `wix-stores:category:{slug}` (deduped)
- `prompt`: category ID, slug, product count, hierarchy, parent/root slugs, example URL from `config/.wix-stores.yaml`, binding hints for `product-search`, `category-list`, `related-products`, contract paths

Static component items remain in `wix-stores.yaml` (setup). AIditor merges both files at read time.

## Release coordination

Ship **`@jay-framework/wix-stores`** with **`@jay-framework/aiditor`** for M19.1 smoke. ui-kit ([#142](../../jay/design-log/142%20-%20ui-kit-add-menu-contribution.md)) independent.

## Background

AIditor reads `agent-kit/aiditor/add-menu/*.yaml` on plugin setup. Extend existing `setupWixStores` in [`lib/setup.ts`](../packages/wix-stores/lib/setup.ts).

## Design

### Output

`<project>/agent-kit/aiditor/add-menu/wix-stores.yaml` — static components on setup. **`wix-stores.generated.yaml`** — one item per indexed category on `jay-stack agent-kit` (M19.2).

### Items (M19.1)

| Contract           | `id`                          | Notes                                                                                                                                                  |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `product-search`   | `wix-stores:product-search`   | Instance props common; optional params overlap with product-page — Rec #2 excludes optional keys (aiditor A7)                                          |
| `product-page`     | `wix-stores:product-page`     | **Q8:** requires `agent-kit/materialized-contracts/wix-stores/product-page.jay-contract` after **wix-stores setup** (dynamic contract materialization) |
| `related-products` | `wix-stores:related-products` |                                                                                                                                                        |
| `category-list`    | `wix-stores:category-list`    |                                                                                                                                                        |

**Not in package:** `category-page` (removed from plugin.yaml).

### Cross-repo test validation (locked)

**Do not** import `@jay-framework/aiditor` in wix-stores tests.

1. **Shape reference:** `jay-aiditor/packages/aiditor/test/fixtures/add-menu/valid-item.yaml` (canonical; copy field rules into test helper).
2. **wix tests:** assert written yaml structure + required fields + absence of `kind`, `parameters`, `component`, `allowedScopes`.
3. Optional: `test/fixtures/add-menu/expected-wix-stores.yaml` in wix repo — `toEqual` normalized parse result.

## Task index

| ID  | Title                                      | Priority |
| --- | ------------------------------------------ | -------- |
| W1  | Template + setup writer                    | P0       |
| W2  | Tests (fixture compare, no aiditor import) | P0       |
| W3  | Thumbnails                                 | P2       |

**Parallel with:** aiditor A1 (schema/fixtures). **Not blocked on** aiditor A3.

---

### Task W1 — Template + setup writer

**Acceptance:**

- `jay-stack setup wix-stores` → `wix-stores.yaml` with 4 items (aiditor criterion 1)
- `product-page` item `prompt` references materialized contract path
- After full wix project setup, `agent-kit/materialized-contracts/wix-stores/product-page.jay-contract` exists — **document in W1** that Q8 in aiditor depends on this (aiditor A7 / A11 smoke)

### Prompt

```
Implement wix-stores Add Menu contributor (Design Log #20 W1).

Read: jay-aiditor/design-log/19 - aiditor-add-menu.md, wix/design-log/20, jay-aiditor implementation plan (cross-repo validation).

packages/wix-stores:
1. agent-kit/aiditor/add-menu.template.yaml — product-search, product-page, related-products, category-list
2. setupWixStores: write agent-kit/aiditor/add-menu/wix-stores.yaml; idempotent; ctx.force
3. product-page prompt must reference agent-kit/materialized-contracts/wix-stores/product-page.jay-contract (materialized by existing setup flow)
4. Build copies template to dist

No wix-media; no generated yaml in M19.1.
```

---

### Task W2 — Tests

### Prompt

```
wix-stores Add Menu setup tests (Design Log #20 W2).

test/setup-add-menu.test.ts + test/fixtures/add-menu/expected-wix-stores.yaml:
- setup writes wix-stores.yaml with 4 ids
- Each item: id, title, category, prompt present
- Rejected keys absent: kind, parameters, component, allowedScopes

Do NOT import @jay-framework/aiditor. Align checks with jay-aiditor test/fixtures/add-menu/valid-item.yaml shape (document path in test comment).

No toContain on code files.
```

---

### Task W3 — Thumbnails (optional, P2)

Defer until assets available.

## Verification

| #   | Check                                                             |
| --- | ----------------------------------------------------------------- |
| 1   | setup without aiditor → yaml exists                               |
| 2   | Field checks per W2 (not aiditor package import)                  |
| 3   | Add Menu Store items after install (aiditor A11 on jay-golf)      |
| 4   | setup --force idempotent                                          |
| 5   | Uninstalled package → items hidden (aiditor filter)               |
| 6   | materialized product-page contract present after setup (Q8 smoke) |

## References

jay-aiditor **#19**, **#15**; jay **#87**

# Design Log #32 — Runtime/Tools Entry Split for Wix Plugins

Status: Implemented

## Background

The Jay Framework landed two paired changes (framework `design-log/179` and `design-log/180`):

- **DL#179 — Compiler-free plugin runtime.** A plugin package ships two kinds of code: **serve-time**
  (headless components, server actions, `init`, client bundle — loaded on the production request path,
  must stay compiler-free) and **tools-time** (validators, CLI commands, agent-kit generators,
  `setup` handlers, dev-only route components — run only under the toolchain, may use the compiler).
  These must not share one module graph. The fix: a third entry per plugin — **`./tools`**
  (`lib/tools.ts` → `dist/tools.js`) — parallel to the existing `./client`. All tools-time handlers
  move there; `index.ts` (`.`) stays compiler-free.
- **DL#180 — Dev-only actions.** `actions[].devOnly: true` marks a browser-callable action whose
  handler lives in `./tools` (compiler-OK) and is excluded from the production build. Enables plugin
  **settings pages** (a `devOnly` route + `devOnly` actions).

The framework loaders were already updated (by the framework team): validators, commands, agent-kit,
and setup now load **only** from `${packageName}/tools` (clean cut, no `.`-fallback). devOnly action
handlers and devOnly route components also resolve from `./tools`.

## Problem

Every wix plugin currently exports its tools-time handlers (`setup`, `agentkit`, `validators`,
`commands`) from `lib/index.ts` (`.`). Under the new framework:

1. **Broken loading (all plugins with a tools capability).** The loaders no longer look on `.` for
   these handlers, so `setup`/`agentkit`/`validate`/commands would fail to load until each handler is
   exposed via `./tools`.
2. **Compiler leak (wix-deploy, wix-media).** Both re-export `validate` from `index.ts`, and their
   validators value-import `parseTemplateParts` from `@jay-framework/compiler-jay-html`. So
   `import('<plugin>')` (the serve entry) transitively loads the compiler into the BaaS deploy bundle.

## Capability inventory

| Plugin            | Tools-time capabilities to move to `./tools`                                      | Compiler in `dependencies`? |
| ----------------- | --------------------------------------------------------------------------------- | --------------------------- |
| wix-bookings      | setup                                                                             | no                          |
| wix-cart          | — (none)                                                                          | no                          |
| wix-data          | agentkit, setup                                                                   | no                          |
| wix-deploy        | validators, commands, setup                                                       | **yes** (jay-html, shared)  |
| wix-forms         | setup                                                                             | no                          |
| wix-media         | validators, commands, agentkit, setup, 5 devOnly actions, devOnly route component | **yes** (jay-html, shared)  |
| wix-members       | validators, setup                                                                 | no (type-only)              |
| wix-server-client | setup                                                                             | no                          |
| wix-stores-v1     | setup                                                                             | no                          |
| wix-stores        | agentkit, setup                                                                   | no                          |

Compiler imports across the repo live **only** in validators
(`wix-deploy/validators/static-filename-validator.ts`,
`wix-media/validators/media-validator.ts` value-import `compiler-jay-html`;
`wix-members/validators/auth-callback-validator.ts` is type-only). Every other wix module is
compiler-free, so moving the validators (plus the clean-cut tools handlers) off `.` makes each
`index.js` compiler-free.

## Design — per-plugin recipe

For every plugin with a tools capability (all except `wix-cart`):

1. **`lib/tools.ts`** (new) — re-export the tools-time handlers with a DL#179 header comment:
   validators, command handlers, agent-kit generator, `setup`, and (wix-media) the devOnly action
   handlers + devOnly route component.
2. **`lib/index.ts`** — remove those re-exports. Keep serve-time exports (components, services,
   contexts, `init`, regular actions, types). Compiler-free.
3. **`package.json`**:
   - Add `"./tools": "./dist/tools.js"` to `exports`.
   - `build:types`: append `lib/tools.ts` to the tsup entry list.
   - Where `compiler-*` is a runtime `dependency` (wix-deploy, wix-media), move `compiler-jay-html`
     and `compiler-shared` to `peerDependencies` (provided by the toolchain) + keep a
     `devDependency`.
4. **`vite.config.ts`**:
   - Add `tools: resolve(__dirname, 'lib/tools.ts')` to the SSR `lib.entry`.
   - Add `/^@jay-framework\/compiler-/` to `rollupOptions.external` so any future compiler leak into
     `.` surfaces as a literal import string in `dist/index.js` (DL#179 leak scan).

### wix-media specifics (DL#180)

- Mark the 5 settings actions `devOnly: true` in `plugin.yaml` (object form) so production excludes
  them; their handlers move to `./tools`.
- The settings route (`/wix-media/settings`) is already `devOnly: true`; its server component
  (`mediaSettingsPage`) moves to `./tools`. The client hydration export stays on `./client`
  (`index.client.ts` unchanged).
- wix-media's settings actions are compiler-free — they move for production exclusion + clean-cut, not
  for a compiler leak.

## Implementation Plan

1. Add `lib/tools.ts` and trim `lib/index.ts` for all 9 plugins.
2. Update `package.json` exports, `build:types`, and compiler dep placement.
3. Update `vite.config.ts` (tools entry + compiler external).
4. wix-media: mark settings actions `devOnly`.
5. Build + type-check + plugin-validate the repo (`yarn build`, `yarn build:check-types`).

## Verification Criteria

- `dist/index.js` of wix-deploy and wix-media contains no `@jay-framework/compiler-` import
  (DL#179 leak scan).
- `jay-stack-cli validate-plugin` passes for every plugin (requires `./tools` when a tools capability
  is declared).
- `yarn build` and `yarn build:check-types` are green across the repo.

## Implementation Results

Implemented exactly as designed. All 9 tools-bearing plugins now have a `./tools` entry; `wix-cart`
was untouched (no tools capability).

### Per-plugin changes

- **`lib/tools.ts`** added to all 9 plugins, re-exporting only tools-time handlers (validators,
  commands, agent-kit, `setup`, and — wix-media — the 5 devOnly action handlers + devOnly route
  component). Each carries a DL#179 header comment.
- **`lib/index.ts`** trimmed of those re-exports in all 9; serve-time exports (components, services,
  contexts, `init`, regular actions, types) retained. wix-deploy `index.ts` now exports only the
  compiler-free `WixDataArtifactStore` (+ type). wix-media `index.ts` keeps only compiler-free helpers
  (index generator, add-menu builders/writers).
- **`package.json`** — `"./tools": "./dist/tools.js"` added to `exports`; `lib/tools.ts` appended to
  the `build:types` tsup entry list. For wix-deploy and wix-media, `compiler-jay-html` and
  `compiler-shared` moved from `dependencies` to `peerDependencies` (+ retained as `devDependencies`).
- **`vite.config.ts`** — `tools` added to the SSR `lib.entry`; `/^@jay-framework\/compiler-/` added to
  `rollupOptions.external` (wix-media's two explicit compiler externals were collapsed into the regex;
  wix-deploy's regex sits alongside its `publicDeps` array).
- **wix-media `plugin.yaml`** — the 5 settings actions converted to object form with `devOnly: true`
  (the `/wix-media/settings` route was already `devOnly`).

### Verification

- **Leak scan (DL#179):** `dist/index.js` contains **0** `@jay-framework/compiler-` imports for all 9
  plugins. In wix-deploy and wix-media the compiler imports are confined to `dist/tools.js` as
  externalized import strings (wix-deploy: `compiler-jay-html`, `compiler-shared`, `compiler-jay-stack`,
  `compiler-analyze-exported-types`; wix-media: `compiler-jay-html`, `compiler-shared`).
- **`yarn build`:** 26/26 packages built successfully (10 wix packages + explorations + all example
  apps). `jay-stack-cli validate-plugin` runs inside each plugin build and passed for every plugin,
  confirming the loaders resolve the tools capabilities from `./tools`.
- **`yarn build:check-types`:** exit 0 across the repo.

### Deviations

None. The plan was followed as written.

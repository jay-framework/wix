# Design Log 36: BaaS Entry — Project Action Registration

## Status

Draft (Design)

## Decisions for the Implementer (TL;DR)

- **The bug:** `generateEntrySource` in `packages/wix-deploy/lib/commands/build-entry.ts` registers **plugin actions only**. Project actions (manifest entries with `isPlugin: false` and a `serverModule`) are never imported or registered, so on Wix BaaS every `POST /_jay/actions/<name>` for a project action returns **404 ACTION_NOT_FOUND**. Self-hosted `jay-stack serve` works because it registers from the manifest directly.
- **The fix (settled, minimal):** bundle and register project action modules exactly the way plugin actions and server elements already are. Build a `localActionModules` list, add `import * as localActions_N from '<absolutePath>'` lines, and append `{ module: localActions_N, name: '<relativePath>' }` entries to the existing `registerActionsFromModules([...])` array.
- **No new public API, no jay change.** Reuse the existing `registerActionsFromModules` primitive (the framework serve surface established in DL#21 R5) and the existing esbuild absolute-path bundling used for server elements. This is the null-hypothesis-satisfying change.
- **Signature change:** add `localActionModules: Array<{ relativePath: string; absolutePath: string }>` as a **new trailing parameter** to `generateEntrySource` with default `[]`, mirroring `serverElements`.
- **Fail-closed is correct.** If a `serverModule` is missing on disk, esbuild fails the build — never produce an `entry.mjs` that silently 404s. Same behavior as server elements today.
- **Dedup by `relativePath`** when building `localActionModules` (the plugin `actionPackages` list already dedups — `build-entry.ts:499`).
- **Do NOT add project action modules to `MODULE_REGISTRY`** (`build-entry.ts:202`). That registry is for page-parts module resolution; actions are resolved by the action registry, not page-parts.
- **jay-feedback:** add a **wix-deploy build-time check** (static assertion: every non-plugin manifest action with a `serverModule` must appear as a `registerActionsFromModules` entry in the generated source) — **not** a jay-stack validation. Plus update the agent-kit deployment doc. No framework feature.

## Background

DL#21 established the BaaS entry architecture. The framework serve surface established in DL#21 exposes a serve-only surface `@jay-framework/production-server/serve` that lets a bundled `entry.mjs` register pre-imported action modules via `registerActionsFromModules([{ module, name }])` (DL#21 R5) instead of discovering them from the filesystem. `build-entry` (DL#22 pipeline) generates that `entry.mjs`: it imports plugin modules and server-element modules by absolute path, builds a `MODULE_REGISTRY`, and calls `registerActionsFromModules` for plugin action packages.

Actions in a Jay project come in two flavors, both landing in `route-manifest.json` under `actions` (`build-entry.ts:22-27`):

- **Plugin actions** — `isPlugin: true`, identified by `packageName` (e.g. an `@jay-framework/wix-*` package).
- **Project actions** — `isPlugin: false`, authored as `src/actions/*.actions.ts`, compiled to `server/actions/*.js` under the build backend dir and recorded as `serverModule` (a path relative to `ctx.build.backend`).

## Problem

`generateEntrySource` registers plugin actions and omits project actions.

The action list passed to `registerActionsFromModules` is built from `actionPackages`, which is filtered to **plugins only**:

```ts
// build-entry.ts:496-499
const actionPackages = manifest.actions
  .filter((a) => a.isPlugin && a.packageName && pluginPackages.has(a.packageName!))
  .map((a) => a.packageName!)
  .filter((v, i, arr) => arr.indexOf(v) === i);
```

`actionsArray` then maps only those packages (`build-entry.ts:173-176`), and the generated `initialize()` registers only them (`build-entry.ts:251-253`). A manifest entry with `isPlugin: false` is never imported and never registered.

**Runtime consequence (BaaS):** a request `POST /_jay/actions/my-app.submitContactForm` enters the handler (`build-entry.ts:334`), matches `isActionRequest(url.pathname)` (`build-entry.ts:369`), and calls `fetchActionRequest(request)`. The action registry has no entry for that project action, so it returns **404 ACTION_NOT_FOUND**.

**Why self-hosted works:** `jay-stack serve` registers actions with `registerActionsFromManifest(manifest.actions, backendDir)` (DL#21 R5, the "current" filesystem path), which reads **every** manifest action — plugin and project alike — from disk. BaaS swapped that for `registerActionsFromModules` with a hand-curated list that silently dropped project actions. That is the asymmetry: the same `route-manifest.json`, two registration paths, one of them incomplete.

## Prior Art / Adjacent Mechanisms

- **DL#21 (BaaS entry framework requirements)** — the direct prior art. R5 (`registerActionsFromModules`, `build-entry.ts:194,251-253`), R4 (`initializeServicesFromModules`, `build-entry.ts:193,245-247`), R6 (`MODULE_REGISTRY`, `build-entry.ts:202-204`), and the `@jay-framework/production-server/serve` export (`build-entry.ts:188-196`). This log extends R5 to cover project actions.
- **The framework serve surface (consumed via DL#21).** The upstream framework exposes `registerActionsFromModules`, `initializeServicesFromModules`, the `@jay-framework/production-server/serve` export, and the `ArtifactStore`. We consume its **public surface** (`registerActionsFromModules`, `@jay-framework/production-server/serve`); no jay change is required.
- **Server element bundling (the pattern to copy).** `build-entry` already bundles arbitrary local modules by absolute path. `serverElements` is built as `{ relativePath, absolutePath: path.join(buildDir, rel) }` (`build-entry.ts:525-528`), imported as `import * as serverElement_${i} from '${se.absolutePath}'` (`build-entry.ts:163-165`), and esbuild resolves each absolute path through the same bundle, stubs, and alias plugins (`build-entry.ts:600-618`). `buildDir` is `ctx.build.backend` (`build-entry.ts:463`) — the same root project `serverModule` paths are relative to. Project action modules are just one more set of local modules to import by absolute path.
- **DL#22 (wix-deploy pipeline)** and **DL#32 (runtime/tools entry split)** — adjacent: DL#22 documents the `build-entry → upload-backend → deploy-baas` flow this change sits inside; DL#32 covers plugin entry splitting (unrelated to project-action registration but confirms the plugin-vs-local module distinction already baked into the bundler).

## Null Hypothesis — why no new API and no jay change

Before adding anything, ask whether an existing primitive already does this job.

- **Registration:** `registerActionsFromModules([{ module, name }])` already registers pre-imported action modules (`build-entry.ts:251`). Project actions are action modules. Appending entries to the existing array is sufficient — **no new registration mechanism**.
- **Bundling:** esbuild already imports local modules by absolute path for server elements (`build-entry.ts:163-165, 525-528`). Project action modules are local modules under the same `buildDir`. Reuse that path — **no new bundling mechanism, no new stub/alias treatment** (they flow through the same plugins at `build-entry.ts:612`).
- **jay:** jay already emits project actions into `route-manifest.json` with `serverModule`/`isPlugin` (`build-entry.ts:22-27`) and already registers them for self-hosted serve. The gap is wix-deploy's generator omitting them — **a wix-deploy bug, not a framework gap**. No jay change.

The only genuinely new thing is a parameter (`localActionModules`) threaded into `generateEntrySource`, exactly parallel to `serverElements`. Anything larger (a new action-loading path, lazy action fetch from the data collection, a framework API) would be unjustified.

## Q&A (Socratic)

**Q: Can a project action module and a server element module be the same file / double-imported?**
A: In practice no — server element modules come from `route.serverElementPath` / `route.serverModule` and local page-parts entries (`build-entry.ts:502-523`), i.e. compiled page components; project actions compile from `src/actions/*.actions.ts` to `server/actions/*.js`. The output paths don't overlap. Even if the same absolute path were imported under two `import * as` bindings, esbuild deduplicates modules in the bundle (a single module instance, two local names), so there is no double-execution risk. We therefore do **not** cross-dedup against `serverElements`; separate bindings are harmless.

**Q: What if `serverModule` is missing on disk?**
A: esbuild resolves `absolutePath` at bundle time (`build-entry.ts:601-618`). A missing file makes esbuild throw and `build-entry` fail loudly — no `entry.mjs` is produced. This is the correct **fail-closed** behavior: a manifest action without its compiled module is a build error, not a runtime 404. It matches how a missing server element already behaves. `route-manifest.json` is produced by `jay-stack build`, so a missing `serverModule` indicates a broken build that must be fixed, not tolerated.

**Q: Name collision between `relativePath` keys and plugin package names?**
A: No — collision is impossible in principle, because `registerActionsFromModules` **ignores the `name` field for registration entirely**. It iterates each entry's `module` exports and registers every action under the action's own `actionName`, never under the passed `name`. The `name` is only a human-readable label on the entry (the package name for plugins, e.g. `@jay-framework/wix-stores` at `build-entry.ts:175`; the `relativePath` for project actions, e.g. `server/actions/contact.js`) and it never enters the action registry's key space, so the package-name and file-path values cannot collide there. This also makes **double registration safe**: registering the same action twice is an idempotent `Map.set` overwrite keyed on `actionName`. (Separately, `MODULE_REGISTRY` keys at `build-entry.ts:169-172` are untouched by this change.)

**Q: Do project action modules need the same esbuild stub treatment as plugins?**
A: No special treatment. They are reachable from the entry, so the existing `stubBuildDepsPlugin` and `resolveAliasPlugin` (`build-entry.ts:572-598, 612`) apply to them automatically, exactly as for server elements. A project action that happened to import a build-time-only dep is covered by the same stub list (`build-entry.ts:550-567`).

**Q: Should project action modules go into `MODULE_REGISTRY`?**
A: No. `MODULE_REGISTRY` (`build-entry.ts:202-204`) resolves page-parts modules (npm packages + server elements) for `loadPagePartsFromConfig`. Actions are resolved by the action registry via `registerActionsFromModules`, a separate path. Adding them to `MODULE_REGISTRY` would be dead weight and misleading.

**Q: Could the same project action appear more than once in `manifest.actions`?**
A: Possibly (one entry per compiled action module, referenced by multiple routes). Dedup `localActionModules` by `relativePath` to avoid duplicate imports — the plugin list already dedups (`build-entry.ts:499`).

## Design

### Change 1 — `buildEntry` handler: build `localActionModules`

In the handler, after `actionPackages` is computed (`build-entry.ts:496-499`) and alongside where `serverElements` is built (`build-entry.ts:525-528`), derive the project action modules from the manifest, mirroring the server-element shape and deduping by `relativePath`:

```ts
// non-plugin manifest actions → bundle + register like server elements
const localActionModules = manifest.actions
  .filter((a) => !a.isPlugin && a.serverModule)
  .map((a) => ({
    relativePath: a.serverModule,
    absolutePath: path.join(buildDir, a.serverModule),
  }))
  .filter((m, i, arr) => arr.findIndex((x) => x.relativePath === m.relativePath) === i);
```

Add a log line next to the existing ones (`build-entry.ts:530-533`):

```ts
ctx.log(
  `Project action modules: ${localActionModules.length} ` +
    `(${localActionModules.map((m) => m.relativePath).join(', ')})`,
);
```

Pass it as the new trailing argument at the `generateEntrySource` call site (`build-entry.ts:535-542`):

```ts
const entrySource = generateEntrySource(
  plugins,
  actionPackages,
  serverElements,
  collectionId,
  staticBaseUrl,
  version,
  localActionModules, // new
);
```

### Change 2 — `generateEntrySource`: import + register project actions

Add the parameter with a default (`build-entry.ts:152-159`):

```ts
function generateEntrySource(
    plugins: Array<{ name: string; packageName: string }>,
    actionPackages: string[],
    serverElements: Array<{ relativePath: string; absolutePath: string }>,
    collectionId: string,
    staticBaseUrl: string,
    version: string,
    localActionModules: Array<{ relativePath: string; absolutePath: string }> = [],
): string {
```

Add import lines parallel to `seImports` (`build-entry.ts:163-165`):

```ts
const localActionImports = localActionModules.map(
  (m, i) => `import * as localActions_${i} from '${m.absolutePath}';`,
);
```

Extend the registration array. Today `actionsArray` is built only from plugin packages (`build-entry.ts:173-176`); append the project action entries:

```ts
const actionsArray = [
  ...actionPackages.map((pkg) => {
    const idx = plugins.findIndex((p) => p.packageName === pkg);
    return `    { module: pluginModule_${idx}, name: '${pkg}' },`;
  }),
  ...localActionModules.map(
    (m, i) => `    { module: localActions_${i}, name: '${m.relativePath}' },`,
  ),
];
```

Emit `localActionImports` in the generated source next to the server-element imports block (`build-entry.ts:184-185`). The existing `registerActionsFromModules([...])` call (`build-entry.ts:251-253`) now receives both plugin and project entries — no change to the call itself.

### Runtime path after the fix

`POST /_jay/actions/my-app.submitContactForm` → handler (`build-entry.ts:334`) → `isActionRequest` true (`build-entry.ts:369`) → `fetchActionRequest(request)` → action registry now contains the project action module (registered at init, `build-entry.ts:251-253`) → action executes. An `OPTIONS` probe to the same path returns **405 (registered, method not allowed)** instead of **404 ACTION_NOT_FOUND** — the deterministic "registered vs missing" signal.

## Implementation Plan

Branch: the workspace canonical branch across repos. Changes are confined to `packages/wix-deploy`.

- **T1 — (this log).** Design approved before any code.
- **T2 — extend the generator.** Apply Change 1 + Change 2 in `build-entry.ts`. Clean-code: keep `localActionModules` shaped identically to `serverElements`; one log line; default param preserves existing callers.
- **T3 — regression test FIRST (red before green).** `wix-deploy` currently has `"test": ":"` (no suite). Introduce a vitest setup matching sibling packages (e.g. `packages/wix-stores-v1` uses `"test": "vitest run"`). Add `packages/wix-deploy/test/`:
  - A **fixture manifest** with one non-plugin action (`isPlugin: false`, `serverModule: 'server/actions/submit-contact-form.js'`, neutral `actionNames: ['my-app.submitContactForm']`) plus a stub module file on disk at that path so esbuild can resolve it.
  - Call the generator (export `generateEntrySource` for unit-level testing, or drive `buildEntry` against the fixture build dir) and **assert** the generated source contains both `import * as localActions_0 from '<absolutePath>'` and `{ module: localActions_0, name: 'server/actions/submit-contact-form.js' }`. Write the assertion for the **correct** behavior first; it fails red against today's code, then goes green after T2 (no false green — never snapshot current buggy output).
  - Optional smoke (if cheap to stand up a handler from the built entry): `OPTIONS`/`POST` to `/_jay/actions/my-app.submitContactForm` returns **405 (registered)**, not **404**. **Stub requirement (optional smoke only):** because registration keys on the action's own `action.actionName` (not the ignored `name` param), this smoke test's stub module must export a **real jay action** whose `actionName` equals the probed URL path (`my-app.submitContactForm`). The primary source-text assertion above needs only an esbuild-resolvable stub module, so this caveat applies **only** to the optional smoke test.
- **T4 — jay-feedback landing (see below).** Add the wix-deploy build-time check and update the agent-kit doc.

## jay-feedback Decision (REQUIRED)

Priority order: **validation → agent-kit → framework feature.**

- **Validation — YES, as a wix-deploy build-time check (not jay-stack).** The failure mode "a project action in the manifest is not registered in `entry.mjs`" should never silently 404 again. The right home is **wix-deploy**, because the gap lives in wix-deploy's `generateEntrySource`, not in the project source — `jay-stack validate` (in jay) owns the manifest/source and cannot see wix-deploy's bundling choices, so a jay-stack rule is the wrong layer. Recommended, cheapest-first:
  1. **Static assertion in `build-entry`** (primary): after generating the entry source, assert that for every `manifest.actions` entry with `!isPlugin && serverModule`, the source contains a matching `registerActionsFromModules` entry (`name: '<relativePath>'`). Deterministic, runs unconditionally, no server needed, fails the build with a located error naming the missing action. **Scope (what it does and does not prove):** this is a source-text check — it verifies the registration entry was **emitted into the generated source**. It does **not** prove the referenced module exports a valid jay action, nor that the action's own `actionName` matches the manifest `actionNames`. The optional deploy-time `OPTIONS` probe below is the runtime backstop that closes that gap.
  2. **Optional deploy-time `check-project-actions` probe** (defense in depth, in `deploy-baas`): load the built entry and `OPTIONS`-probe each manifest project action at `/_jay/actions/<name>`, failing the deploy on 404. More faithful but heavier; secondary to the static check.
- **Agent-kit — YES.** Update `packages/wix-deploy/agent-kit/devops/wix-baas-deployment.md`:
  - "What Gets Deployed Where" currently lists only "Plugin code (wix-stores, wix-cart, etc.)" under the esbuild bundle — add "Project action modules (`src/actions/*.actions.ts` → `server/actions/*.js`)" as bundled **and registered**.
  - Add a Troubleshooting entry: _"Action returns 404 ACTION_NOT_FOUND on BaaS but works on self-hosted `serve`"_ → cause (project action not registered in `entry.mjs`), fix (rebuild entry after this change; the build-time check now catches it).
- **Framework feature — NO.** No jay change; the framework already exposes `registerActionsFromModules` and already registers project actions for self-hosted serve.

Both the validation (T3/T4) and the agent-kit update (T4) are in scope for this change.

## Verification Criteria

- The generated `entry.mjs` source **imports** (`import * as localActions_N from '<absolutePath>'`) and **registers** (`{ module: localActions_N, name: '<relativePath>' }`) every `manifest.actions` entry with `isPlugin: false && serverModule`.
- Regression test (T3) is red before T2 and green after; it fails if a future change drops project-action registration.
- An `OPTIONS`/`POST` probe to `/_jay/actions/<project-action>` returns **405 (registered)**, not **404 ACTION_NOT_FOUND**.
- The wix-deploy build-time check fails the build when any non-plugin manifest action is absent from the generated registration array.
- No regression for plugin actions or server elements (same output for a manifest with no project actions; `localActionModules` defaults to `[]`).

## Trade-offs

| Decision                                                    | Benefit                                              | Cost                                           |
| ----------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| Reuse `registerActionsFromModules` + absolute-path bundling | No new API, no jay change, parallels server elements | `generateEntrySource` gains one parameter      |
| Bundle every project action into `entry.mjs`                | Synchronous registration at init; no runtime import  | Slightly larger bundle (small server handlers) |
| Fail-closed on missing `serverModule`                       | Never ship a silently-404ing entry                   | A broken build fails loudly (intended)         |
| Build-time static check in wix-deploy                       | Deterministic backslide guard in the rightful owner  | One more build-time assertion to maintain      |

### Scope pre-mortem — what could go wrong

- **Missing `serverModule` on disk** → esbuild fails the build. Acceptable/intended; ensure the error names the action path.
- **Duplicate `serverModule` across manifest entries** → duplicate imports; mitigated by dedup-by-`relativePath` (Change 1).
- **Project action imports a build-time-only dep** → same risk as server elements today; covered by the existing stub list (`build-entry.ts:550-567`), extend if a new one surfaces.
- **Name collision** → theoretical only (file paths vs package names); no action needed.

### Out of scope (explicit)

- Changing **jay** (framework already supports this; consume its public surface only).
- Deploy orchestration **ordering** and the sequential/parallel `upload-backend` flow.
- CMS/data-collection **upload size limits** and cache-size limits.
- Moving project actions **into plugins** (a different authoring model, not a fix for this bug).

## Implementation Results

Status: Implemented (wix-deploy). All in `packages/wix-deploy`; no jay change.

### What landed

- **T2 — generator.** `generateEntrySource` gained a trailing `localActionModules: LocalActionModule[] = []` param; it now emits `import * as localActions_N from '<absolutePath>'` lines and appends `{ module: localActions_N, name: '<relativePath>' }` entries to the `registerActionsFromModules([...])` array, alongside the plugin entries. The `buildEntry` handler collects the modules and logs `Project action modules: N (paths…)`.
- **T3 — regression test (red → green).** Stood up vitest for `wix-deploy` (`"test": "vitest run"`; was `"test": ":"`). `test/build-entry.test.ts`: 2 project-action generator assertions were **red** against the pre-fix code (import + registration entry absent), **green** after T2. Final suite: **7/7 passing**. No false green — assertions encode the correct output, written before the fix.
- **T3 validation (jay-feedback).** Added the build-time backslide guard in `buildEntry`: after generating the source it fails the build (`success:false`, located error) if any non-plugin manifest action with a `serverModule` is absent from the registration array — so an unregistered project action can never silently 404 again.
- **T4 — agent-kit.** `agent-kit/devops/wix-baas-deployment.md`: added project actions to "What Gets Deployed Where", a new "Actions on BaaS (plugin and project)" note, and a "404 ACTION_NOT_FOUND on BaaS but works on serve" troubleshooting entry.

### Deviations from the Design

- **`collectLocalActionModules` extracted as an exported pure helper** rather than built inline in the handler (design Change 1). Reason: unit-testability and single responsibility. Behavior is identical — filter `!isPlugin && serverModule`, dedup by `relativePath`, `path.join(ctx.build.backend, serverModule)`.
- Otherwise implemented as designed: no new public API beyond the defaulted param + the helper export, no jay change, no `MODULE_REGISTRY` entry, reuses the server-element esbuild bundling path and the `registerActionsFromModules` primitive.

### jay-feedback landing (recorded)

- **Validation — DONE (wix-deploy build-time check).** The static backslide guard above, in the rightful owner (`build-entry`), not jay-stack.
- **Agent-kit — DONE.** `wix-baas-deployment.md` updated (bundle contents + 404 troubleshooting).
- **Framework feature — none** (jay already exposes `registerActionsFromModules` and registers project actions for self-hosted serve).

### Verification

- `wix-deploy` build + plugin validation pass; `build:check-types` clean for `build-entry.ts`.
- Downstream (consumer repo, same branch) follow-up: drop the interim local pre-deploy patch, confirm the OPTIONS→405 deploy gate passes without it, and verify the form-submit path in a running app.

### Review follow-up (code review before QA)

- **Guard replaced.** The first build-time guard checked the generated source against the same `localActionModules` list that produced it, so it could never fail. It was replaced by `findUnbundledProjectActions(manifest.actions)`: `build-entry` now fails (`success:false`, naming the actions) when the manifest lists a non-plugin action **without** a `serverModule`. Before, those entries were silently skipped, so the design's "fail-closed on missing `serverModule`" was not actually implemented.
- **`vitest` declared** in `wix-deploy` `devDependencies` (it previously resolved only through hoisting); `yarn.lock` updated.
- **Tests:** 8/8 passing (added a `findUnbundledProjectActions` case). `tsc` and prettier clean.
- **End-to-end in a consumer app** (production build, then `build-entry`, then an OPTIONS probe of every manifest project action through the built `entry.mjs`; no local patch applied):
  - Published `0.25.4`: **0/30** project actions served (404), which reproduces the bug.
  - This branch: **30/30** served. `build-entry` logs `Project action modules: 19`. A `serve.mjs` probe returns **405** for registered actions and **404 ACTION_NOT_FOUND** for an unknown name.
- **Not yet verified:** a real form submission on the published site. That needs a deploy (`upload-backend` + `deploy-baas`) and writes real data.

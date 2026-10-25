# 39 — Wix Headless onboarding for Jay projects: findings and an agent-friendly setup path

Status: **[Design]** — findings from an end-to-end run (agent creating a Jay + Wix Stores project from scratch), with proposed fixes. Awaiting review.

## Decisions for the Implementer (TL;DR)

1. **Server calls must work right after `setup`.** Today `wix-server-client` setup writes `appStrategy: { appId, appSecret }` only, and every server-side Wix call then fails with `Missing refresh token or instance ID` (F2). Either complete the app strategy or guide the user to `apiKeyStrategy` — never report `configured` for a config that cannot make a call.
2. **Pin the Wix CLI the setup shells out to, and check Node up front (F1).** `npx @wix/cli@latest` now requires Node `>= 24.18.0`; Jay projects require Node `>= 20`. On Node 22 the setup cannot run at all.
3. **Offer a non-interactive site path (F3):** `npm create @wix/new@latest headless init --site-template commerce --business-name "<name>" --folder-name <tmp> --skip-install --skip-git --no-publish` creates a headless site **with Wix Stores installed** and writes `wix.config.json` (`appId`, `siteId`) — no prompts. Setup can run it in a temp folder and adopt the `wix.config.json`.
4. **`wix-stores` setup must not depend on its own service (F4).** It calls `getService(WIX_STORES_SERVICE_MARKER)`, which only its own init registers — and Jay's `setup` runs init after setup. Build what the check needs from `WIX_CLIENT_SERVICE` + `loadWixStoresConfig()` directly.
5. **The API key stays a user step (F5)** — it is created in the dashboard. Setup prints the exact link, permissions, and the YAML to paste.

## Background

Goal: an agent (or a new user) goes from nothing to a running Jay store on Wix Headless: `create-jay --plugins "Wix Stores"` → site → credentials → dev server → product data. Run on published `0.25.5`, Node 22.20 (default) with Node 24.22 installed side-by-side for the Wix CLI.

## Findings

### F1 — Setup needs Node ≥ 24.18 (via `@wix/cli@latest`)
- `wix-server-client` `tools.ts` runs `npx @wix/cli@latest whoami|login|token`. `npm view @wix/cli engines` → `{ node: '>= 24.18.0' }`. On Node 22 the CLI prints "Your current node version is lower than the minimum required" and exits, so `jay-stack-cli setup --interactive` cannot log in or fetch the app secret.
- **Fix:** pin a CLI version compatible with Jay's supported Node range (or run it via `npx -p node@24`-style shim), and check `process.version` first with a clear message ("Wix setup needs Node ≥ X; you have Y").

### F2 — `appStrategy` without an instance id cannot call server APIs
- After a successful interactive setup, `config/.wix.yaml` = `appStrategy: { appId, appSecret }` + `oauthStrategy.clientId`. On `jay-stack dev`, `wix-stores` init logs `Failed to load data extension schemas: Error: Missing refresh token or instance ID. Either one is needed to get app level access tokens.` (`@wix/sdk` `AppStrategy.getAuthHeaders`). Every server-side read fails, yet setup reported `configured`.
- **Fix options:** (a) resolve and store the site's app `instanceId` during setup (⚠️ assumed available via the CLI token — verify the endpoint); (b) default to `apiKeyStrategy` and walk the user through the key (F5); (c) at minimum, make setup's connectivity check perform one real server call and report `needs-config` on failure.

### F3 — Creating/linking a headless site non-interactively
- `ensureWixSiteConnection` runs `npm create @wix/new@latest init` — interactive only.
- `npm create @wix/new@latest headless link --business-name …` is non-interactive but rejects non-Astro projects: `Only Astro projects can be linked to Wix`.
- ✅ `headless init --site-template commerce --business-name … --no-publish --skip-install --skip-git` works without a TTY, creates the site with **Wix Stores already installed**, and writes `wix.config.json`. Copying that file into the Jay project lets the rest of setup proceed (app secret fetched, `.wix.yaml` written).
- **Fix:** in non-interactive mode (agents/CI), when `wix.config.json` is missing, run `headless init` in a temp dir with the template implied by the selected plugins (`commerce` for stores) and adopt its `wix.config.json`.

### F4 — `wix-stores` setup always fails under `jay-stack setup`
- `setupWixStores` → `getService(WIX_STORES_SERVICE_MARKER)` → "WixStoresService not available. Run setup for wix-server-client first." on every run, even after `wix-server-client` is configured. The service is registered by `wix-stores`' own init, which Jay's setup runs only after a plugin's setup returns `configured`. The dev server (which runs all inits) works.
- **Fix:** derive the setup check from `getService(WIX_CLIENT_SERVICE)` + `loadWixStoresConfig()`; do not require the plugin's own service in setup. (Jay is also asked to run a plugin's init before its setup when dependencies are configured — either side fixes it.)

### F5 — API key creation is dashboard-only
- Writes (e.g. updating a product image) need `apiKeyStrategy` with Wix Stores permissions. Keys are created at `https://manage.wix.com/account/api-keys`; there is no CLI path.
- **Fix:** setup prints the link, the permission names (*Manage Products* / Wix Stores), and the exact `config/.wix.yaml` block with `siteId` / `clientId` pre-filled from `wix.config.json`, and reminds that `apiKeyStrategy` and `appStrategy` are mutually exclusive.

### F6 — `jay-backend-files` is only needed for Wix Deploy
- Setup docs list the CMS collection among prerequisites; it is only used by `wix-deploy`. Scope the instruction to projects that install that plugin.

## Proposed onboarding flow (non-interactive)

```
create-jay --name my-store --plugins "Wix Stores"
→ setup: Node check → wix whoami (login = user step if expired)
→ no wix.config.json → headless init --site-template commerce (temp dir) → adopt wix.config.json
→ fetch app secret → write .wix.yaml → one real API call → configured | needs-config
→ if writes are needed: print API key instructions (user step)
```

User steps that remain: browser login (only if expired), API key creation.

## Verification
- On Node 22 with Node 24 absent: setup prints the Node requirement instead of a CLI crash.
- Fresh project, non-interactive: setup ends with a `wix.config.json`, a `.wix.yaml`, and a successful server call (`GET /stores/v3/products`).
- `wix-stores` setup reports `configured` in the same run as `wix-server-client`.

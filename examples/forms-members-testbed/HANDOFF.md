# forms-members-testbed — handoff

A **publishable** Wix headless + Jay testbed (Members + Wix Forms + Data + Deploy), standing in for
Starkdale (under review, can't publish) to validate the new forms capabilities and the
**AsyncLocalStorage-on-Wix-BaaS** question for jay DL #228.

Regenerated 2026-10-25 with the **fixed** `create-jay` (local build):
`node <jay>/packages/jay-stack/create-jay/dist/index.js --name forms-members-testbed --plugins "Wix Forms,Wix Members,Wix Data,Wix Deploy"`.

## Status

- ✅ Scaffolded by the fixed create-jay (Wix Forms is now a real plugin; Title-Case names match).
- ✅ Dependencies pinned to a consistent **0.25.5** and installed; `wix-server-client` exposes `./tools`
  again (the version-mismatch break is gone).
- ✅ `wix-members` configured; agent-kit docs generated; `config/.wix-forms.yaml` + `.wix-members.yaml` created.
- ⛔ **Remaining = one-time Wix connect (Noam, real terminal, VPN):** `setup` reports
  `wix-server-client → interactive login`, `wix-deploy → wix.config.json not found`,
  `wix-forms → set defaultFormId`, `wix-data → WixClientService not available` (clears after login/config).

> ⚠️ **Registry note (corrected):** both public `registry.npmjs.org` and private `npm.dev.wixpress.com`
> host all `@jay-framework/*` at **0.25.5**. BUT **public npm is unreachable/flaky over the Wix VPN**
> (`ENOTCONN`/`EBADF`), so on this machine the **private** registry is the reliable source. The local
> `.npmrc` here scopes `@jay-framework` → private for that reason (keep `^0.25.5` pins in package.json).
> (The create-jay version mismatch earlier was its own fragile `npm view` resolution trusting flaky/cached
> results — not a registry-content problem.)

## One-time setup (Noam)

```bash
cd wix/forms-members-testbed
npm create @wix/new@latest init     # browser OAuth; connect/create a site -> wix.config.json
# In the Wix dashboard for that site:
#   - enable Members signup
#   - install the Forms app + create at least one form
#   - create a CMS collection or two (Gap B dual-write demo)
#   - create the `jay-backend-files` collection (wix-deploy)
#   - create an API key (Account Settings) -> add to config/.wix.yaml
# set defaultFormId in config/.wix-forms.yaml (any real form id)
npm run setup                        # repeat until all plugins "configured"
npm run agent-kit                    # enumerates forms/collections -> per-form contracts
npm run dev                          # http://localhost:3000
npm run build:production && npm run wix:deploy   # deploy to Wix BaaS
```

## Test our local wix-forms (DL #38/#39 + the two browser-QA bugfixes)

Published 0.25.5 is the OLD generic wix-forms. After install, overlay the local build:

```bash
cd ../packages/wix-forms && npm run build && cd -
cp -R ../packages/wix-forms/dist      node_modules/@jay-framework/wix-forms/
cp    ../packages/wix-forms/plugin.yaml node_modules/@jay-framework/wix-forms/
cp -R ../packages/wix-forms/agent-kit node_modules/@jay-framework/wix-forms/
npm run agent-kit
```

## ALS-on-BaaS probe (jay DL #228 Phase 0 — the gating question)

Add a minimal server action using `AsyncLocalStorage` (`node:async_hooks`) directly, deploy to Wix
BaaS, hit it concurrently; confirm the store survives `await` and doesn't bleed across requests. If it
holds, jay #228's mechanism is safe; if not, #228 pivots. Ask the coordinator to drop in the probe
once the site is connected.

## Notes
- The previous hand-wired attempt is parked at `../forms-members-testbed.old-handwired` (safe to delete).

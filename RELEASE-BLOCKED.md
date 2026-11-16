# Release blocked

Publishing is blocked: DL #51 (address fields) gate open until the follow-up address log ships and DL #51 L6 passes.

- While this file exists, `scripts/publish.cjs` (`yarn publish`) and the "Publish Packages" workflow exit non-zero, so **no package** publishes from `main`.
- Do not publish by hand (`npm publish`, `yarn npm publish`, `yarn workspaces foreach … npm publish`) and do not run the publish workflow on another ref to get around it.
- Releases meanwhile go through a hotfix: a `hotfix/<name>` branch from tag `pre-dl51-gate` (or the latest `hotfix-<package>-<version>` tag), released, tagged and merged back to `main`. See `design-log/51 - address and composite form fields.md`, Implementation Plan.
- The follow-up address log's implementation deletes this file, only after L6 passes.

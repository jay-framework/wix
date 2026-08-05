# wix

Jay Framework packages for Wix integrations (`@jay-framework/wix-*`).

## Development Setup

Install Node from [.nvmrc](.nvmrc) (Node >= 20). Yarn is pinned via `packageManager` in [package.json](package.json) — enable Corepack once so everyone uses the same version:

```bash
corepack enable
yarn install
yarn build
```

Before submitting a pull request:

```bash
yarn confirm    # rebuild + type check + test + format
```

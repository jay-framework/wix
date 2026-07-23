# Design Log #27 — Interactive Setup for Wix Plugins

## Background

Jay Framework DL#157 introduces interactive plugin setup. The framework now supports two modes:

- **Human mode** (`--interactive`): Uses `@inquirer/prompts` for TTY input. Required for browser-based flows.
- **Agent mode** (default): Non-interactive. Prompts use pre-supplied answers (`--answers answers.yaml`) or throw `SetupNeedsAnswerError` to request missing values.

Each prompt requires a stable `key` for answer matching across re-runs. The setup context provides `ctx.interactive` (boolean) and `ctx.prompt` (input/confirm/select).

Setup handlers are standard Node.js functions — they can use `execSync`/`spawn` from `node:child_process` to run shell commands. Flows that require a TTY (like Wix CLI login opening a browser) **require human mode** (`ctx.interactive === true`).

### Related

- Jay DL#87 — Jay-stack setup command
- Jay DL#153 — npm create jay
- Jay DL#157 — Interactive plugin setup
- Wix DL#18 — Wix Members Package
- Wix DL#22 — Wix Deploy Pipeline

## Problem

Wix plugin setup logic currently lives in `create-jay` (the project scaffolder), not in the plugins themselves. This means:

1. `create-jay` knows about `@wix/cli login`, Wix API keys, `wix.config.json` structure
2. Running `jay-stack-cli setup` after the initial scaffold doesn't re-run the interactive Wix flow
3. New Wix plugins can't add their own setup steps without modifying `create-jay`

## Setup Dependency Chain

```
wix-server-client          (credentials — all other wix plugins depend on this)
  ├── wix-stores           (product catalog, categories)
  ├── wix-stores-v1        (v1 catalog API)
  ├── wix-data             (CMS collections)
  ├── wix-media            (media manager)
  ├── wix-members          (auth, needs callback page)
  ├── wix-cart             (no setup handler)
  └── wix-deploy           (BaaS deployment, needs wix.config.json + data collection)
```

## Design — Plugin Setup Sequences

### Setup Modes and the Human Requirement

The Wix login flow (`npx @wix/cli login`) opens a browser for OAuth. This cannot work in agent mode — there is no human to authenticate. Similarly, `npm create @wix/new@latest init` is interactive (site selection UI).

**Rule:** When wix-server-client needs to run the Wix login or site connection flow, it must require `ctx.interactive === true`. If the handler is running in agent mode and credentials are missing, it returns `needs-config` with a message explaining that human-mode setup is required:

```
Wix login requires interactive mode. Run: jay-stack-cli setup --interactive
```

Once credentials are established (human has logged in and provided API key), all subsequent setup runs work in agent mode — the config file exists and validation is non-interactive.

### Prompt Keys

Each prompt uses a stable `key` so that agent-mode answers files can supply values:

| Plugin            | Key                    | Type    | Human-only                             |
| ----------------- | ---------------------- | ------- | -------------------------------------- |
| wix-server-client | `wix-api-key`          | input   | No (agent can supply via answers file) |
| wix-members       | `create-auth-callback` | confirm | No                                     |

The Wix CLI login and site connection steps are **not prompts** — they are shell commands that require a TTY. These steps have no `key` because they cannot be answered via an answers file.

### 1. wix-server-client — Full credential flow

The `wix-server-client` plugin's setup handler owns the Wix credential flow. This logic currently lives in `create-jay/lib/index.ts` (`setupWix` + `promptWixApiKey`) and moves here.

**Sequence:**

1. Check if `config/.wix.yaml` exists with valid (non-placeholder) values → return `configured`
2. **Requires human mode from here on** — if `!ctx.interactive`, return `needs-config` with message to run `--interactive`
3. Check Wix CLI login: `execSync('npx @wix/cli whoami')` — if fails, `execSync('npx @wix/cli login', { stdio: 'inherit' })`
4. Check `wix.config.json` exists — if not, `execSync('npm create @wix/new@latest init', { stdio: 'inherit' })`
5. Read `appId` and `siteId` from `wix.config.json`
6. Prompt for API key: `ctx.prompt.input({ key: 'wix-api-key', message: '...' })`
7. Write `config/.wix.yaml` with real values (not placeholders)
8. Update `.gitignore` — add `config/.wix.yaml` and `wix.config.json`

```typescript
export async function setupWixServerClient(ctx: PluginSetupContext): Promise<PluginSetupResult> {
  const configPath = path.join(ctx.configDir, '.wix.yaml');

  // Already configured with real values?
  if (fs.existsSync(configPath)) {
    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any;
    const apiKey = config?.apiKeyStrategy?.apiKey || '';
    const siteId = config?.apiKeyStrategy?.siteId || '';
    if (apiKey && !apiKey.startsWith('<') && siteId && !siteId.startsWith('<')) {
      if (ctx.initError) {
        return { status: 'error', message: `Credentials invalid: ${ctx.initError.message}` };
      }
      return {
        status: 'configured',
        message: `Wix client connected (site: ${siteId.substring(0, 8)}...)`,
      };
    }
  }

  // Wix login and site connection require a human at a TTY
  if (!ctx.interactive) {
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(ctx.configDir, { recursive: true });
      fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
    }
    return {
      status: 'needs-config',
      configCreated: !fs.existsSync(configPath) ? ['config/.wix.yaml'] : undefined,
      message: 'Wix login requires interactive mode. Run: jay-stack-cli setup --interactive',
    };
  }

  // Interactive (human): full credential flow
  // 1. Wix CLI login
  try {
    execSync('npx @wix/cli whoami', { cwd: ctx.projectRoot, stdio: 'pipe' });
  } catch {
    execSync('npx @wix/cli login', { cwd: ctx.projectRoot, stdio: 'inherit' });
  }

  // 2. Connect to site
  const wixConfigPath = path.join(ctx.projectRoot, 'wix.config.json');
  if (!fs.existsSync(wixConfigPath)) {
    execSync('npm create @wix/new@latest init', { cwd: ctx.projectRoot, stdio: 'inherit' });
  }

  if (!fs.existsSync(wixConfigPath)) {
    return { status: 'needs-config', message: 'wix.config.json not created — run setup again' };
  }

  // 3. Read site credentials
  const wixConfig = JSON.parse(fs.readFileSync(wixConfigPath, 'utf-8'));
  const siteId = wixConfig.siteId || '';
  const appId = wixConfig.appId || '';

  if (!siteId || !appId) {
    return { status: 'needs-config', message: 'Missing siteId or appId in wix.config.json' };
  }

  // 4. Prompt for API key (works in both modes via key)
  const apiKey = await ctx.prompt.input({
    key: 'wix-api-key',
    message: 'Wix API Key (create at https://manage.wix.com/account/api-keys):',
    validate: (v) => v.trim().length > 0 || 'API key is required',
  });

  // 5. Write credentials
  fs.mkdirSync(ctx.configDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    yaml.dump({
      apiKeyStrategy: { apiKey: apiKey.trim(), siteId },
      oauthStrategy: { clientId: appId },
    }),
    'utf-8',
  );

  // 6. Update .gitignore
  const gitignorePath = path.join(ctx.projectRoot, '.gitignore');
  const entries = ['config/.wix.yaml', 'wix.config.json'];
  if (fs.existsSync(gitignorePath)) {
    let content = fs.readFileSync(gitignorePath, 'utf-8');
    for (const entry of entries) {
      if (!content.includes(entry)) content += `\n${entry}`;
    }
    fs.writeFileSync(gitignorePath, content.trimEnd() + '\n', 'utf-8');
  }

  return {
    status: 'configured',
    configCreated: ['config/.wix.yaml'],
    message: `Wix client connected (site: ${siteId.substring(0, 8)}...)`,
  };
}
```

### 2. wix-deploy — Fully automated (no interactive prompts)

Already auto-fills `clientId`/`siteId` from `wix.config.json` and auto-creates the `jay-backend-files` data collection if missing. No user prompts needed — once wix-server-client has credentials, everything is automated. Works in both human and agent mode.

**Sequence:**

1. Check `wix.config.json` exists → `needs-config` if missing
2. Auto-fill `clientId`/`siteId` in `.wix.yaml` from `wix.config.json`
3. Check API key configured → `needs-config` if placeholder (wix-server-client handles the prompt)
4. Query `jay-backend-files` collection → create if missing

### 3. wix-members — Create auth callback page

Works in both human and agent mode — no shell commands needed.

**Sequence:**

1. Check initError → error if wix-server-client not configured
2. Create `.wix-members.yaml` config if missing (current behavior)
3. Check if auth callback page exists
4. If missing: prompt with `ctx.prompt.confirm({ key: 'create-auth-callback', ... })` — works in both modes (agent supplies answer via file, human confirms interactively)
5. If confirmed, create page from template

The auth callback page template currently lives in `create-jay/templates/auth-callback.jay-html` and needs to move into the wix-members package.

```typescript
export async function setupWixMembers(ctx: PluginSetupContext): Promise<PluginSetupResult> {
  if (ctx.initError) {
    return { status: 'error', message: `Service init failed: ${ctx.initError.message}` };
  }

  // Create config if missing (current behavior)
  const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);
  const configCreated: string[] = [];
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
    configCreated.push(`config/${CONFIG_FILE_NAME}`);
  }

  const config = loadWixMembersConfig(ctx.projectRoot);
  const callbackUrl = config.authCallbackUrl;

  // External callback — no page needed
  if (!callbackUrl.startsWith('/')) {
    return { status: 'configured', configCreated, message: `External callback: ${callbackUrl}` };
  }

  // Check if callback page exists
  const routeSegments = callbackUrl.replace(/^\//, '').split('/');
  const expectedPath = `src/pages/${routeSegments.join('/')}/page.jay-html`;
  const fullPath = path.join(ctx.projectRoot, expectedPath);

  if (!fs.existsSync(fullPath)) {
    const create = await ctx.prompt.confirm({
      key: 'create-auth-callback',
      message: `Create auth callback page at ${expectedPath}?`,
      default: true,
    });
    if (create) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, AUTH_CALLBACK_TEMPLATE, 'utf-8');
    } else {
      return {
        status: 'needs-config',
        configCreated,
        message: `Auth callback page missing: ${expectedPath}`,
      };
    }
  }

  return {
    status: 'configured',
    configCreated,
    message: `Wix Members configured (callback: ${callbackUrl})`,
  };
}
```

### 4. wix-stores, wix-stores-v1, wix-data, wix-media — No interactive changes

These plugins validate API access and generate references. No user prompts needed. Work in both human and agent mode:

- Check wix-server-client is configured (via `ctx.initError`)
- Validate API access (query products/collections/media)
- Return `configured` or `error`

### 5. wix-cart — No setup handler

No changes needed.

## Implementation Plan

### Phase 1: Update wix-server-client

1. Rewrite `setupWixServerClient` in `packages/wix-server-client/lib/setup.ts` with the interactive flow above
2. Port the credential flow from `create-jay/lib/index.ts` (`setupWix` + `promptWixApiKey`)
3. Use `execSync` from `node:child_process` for Wix CLI login and site connection (requires `ctx.interactive`)
4. Port `.gitignore` update logic from `create-jay`

### Phase 2: Update wix-members

1. Move `create-jay/templates/auth-callback.jay-html` template into the wix-members package
2. Update `setupWixMembers` in `packages/wix-members/lib/setup.ts` — use `ctx.prompt.confirm()` with `key: 'create-auth-callback'`

### Phase 3: Remove from create-jay

1. Remove `promptWixApiKey`, `setupWix`, `hasWixPlugins` from `create-jay/lib/index.ts`
2. `create-jay` just runs `jay-stack-cli setup --interactive` after install

## Verification Criteria

1. Fresh `npm create jay` with Wix plugins → `jay-stack setup --interactive` prompts for Wix login, site, API key
2. `jay-stack setup` (agent mode) on unconfigured project → returns `needs-config` with "run --interactive"
3. `jay-stack setup` (agent mode) on configured project → returns `configured` (no prompts needed)
4. `jay-stack setup --answers answers.yaml` with API key → works if wix.config.json already exists
5. Auth callback page creation works in both human and agent mode (via prompt key)
6. wix-deploy auto-creates `jay-backend-files` collection without prompts in both modes

# DL29 - App Strategy Support for wix-server-client

## Background

The `wix-server-client` package currently only supports `ApiKeyStrategy` for server-side authentication. The Wix SDK also provides `AppStrategy`, designed for Wix Apps that authenticate using an appId/appSecret pair. There's already a commented-out `AppStrategy` usage in `wix-client-service.ts`.

The `@wix/sdk` `AppStrategy` accepts:

- `appId` (required)
- `appSecret` (optional)
- `publicKey` (optional)
- One of: `refreshToken`, `instanceId`, or `accessToken` (all optional)

## Problem

1. **API Key is user-level access, not site/project-level.** `ApiKeyStrategy` authenticates as the user's account, not scoped to a specific site or app. Moving to `AppStrategy` with appSecret provides site-level access, which is the correct scope.
2. **Setup requires interactive credential entry.** The current flow prompts the user for an API key during `npm create jay` or the setup hook. By automating appSecret retrieval via the Dev Center API, the setup becomes fully transparent — no interactive step needed.

## Design

Make the server-side auth strategy configurable: the config can provide **either** `apiKeyStrategy` **or** `appStrategy` (exactly one is required).

### Config YAML

Current:

```yaml
apiKeyStrategy:
  apiKey: 'IST.xxx'
  siteId: 'abc-123'

oauthStrategy:
  clientId: 'def-456'
```

New (option A — apiKey, unchanged):

```yaml
apiKeyStrategy:
  apiKey: 'IST.xxx'
  siteId: 'abc-123'

oauthStrategy:
  clientId: 'def-456'
```

New (option B — appStrategy):

```yaml
appStrategy:
  appId: 'my-app-id'
  appSecret: 'my-app-secret'

oauthStrategy:
  clientId: 'def-456'
```

### Config Types

```typescript
export interface ApiKeyConfig {
  apiKey: string;
  siteId: string;
}

export interface AppConfig {
  appId: string;
  appSecret: string;
}

export interface OAuthConfig {
  clientId: string;
}

export type ServerAuthConfig =
  | { kind: 'apiKey'; apiKey: ApiKeyConfig }
  | { kind: 'app'; app: AppConfig };

export interface WixConfig {
  auth: ServerAuthConfig;
  oauth: OAuthConfig;
}
```

### Config Loader Changes (`config-loader.ts`)

- Accept either `apiKeyStrategy` or `appStrategy` in the YAML (exactly one required)
- Validate the chosen strategy's fields
- Return `WixConfig` with the discriminated `ServerAuthConfig`

### Client Service Changes (`wix-client-service.ts`)

```typescript
export function provideWixClientService(config: WixConfig) {
  const auth =
    config.auth.kind === 'apiKey'
      ? ApiKeyStrategy({
          apiKey: config.auth.apiKey.apiKey,
          siteId: config.auth.apiKey.siteId,
        })
      : AppStrategy({
          appId: config.auth.app.appId,
          appSecret: config.auth.app.appSecret,
        });

  const instance = createClient({ auth, modules: {} });
  registerService(WIX_CLIENT_SERVICE, instance);
}
```

### Setup Changes (`setup.ts`)

- `hasValidCredentials` recognises both strategy shapes
- After `wix init` creates `wix.config.json`, automatically fetch appSecret via Dev Center API
- Write `.wix.yaml` with `appStrategy` — no interactive credential prompts needed
- Fall back to manual entry only if the automated fetch fails

### Init Changes (`init.ts`)

- The `oauthClientId` passthrough to the client stays the same — both strategies still use OAuth on the client side

## Questions

1. Should `appSecret` be required or optional in the config? The SDK allows it to be optional, but for server-side use it's typically needed.
   - **Decision**: Required — the server-side use-case needs it.

2. Do we need to support the optional `refreshToken` / `instanceId` / `accessToken` fields on `AppStrategy`?
   - **Decision**: Not in the initial version. Start with `appId` + `appSecret` only.

3. Is `oauthStrategy` still required when using `appStrategy`?
   - **Question for user**: With `appStrategy`, the appId _is_ the clientId for OAuth. Should the config infer `oauthStrategy.clientId` from `appStrategy.appId`, or still require it explicitly?

## Implementation Plan

### Phase 1: Config types and loader

1. Update `WixConfig` and add `AppConfig`, `ServerAuthConfig` types in `config-loader.ts`
2. Update `loadConfig()` to accept either strategy, validate accordingly
3. Return discriminated union in `WixConfig.auth`

### Phase 2: Client service

4. Update `provideWixClientService` to branch on `config.auth.kind`

### Phase 3: Setup

5. Update `hasValidCredentials` to recognise `appStrategy` config shape
6. Update interactive setup to support the new strategy

### Phase 4: Init

7. Handle the case where `oauthStrategy.clientId` comes from `appStrategy.appId` (if we decide to infer)

## Exploration Results

**Validated**: The appSecret can be retrieved automatically during setup using the Dev Center API.

### Automated Setup Flow

Prerequisites: user runs `npx @wix/cli@latest login` (already part of setup) and `npx @wix/cli@latest init` (creates `wix.config.json` with `appId`).

Steps:

1. `npx @wix/cli@latest token` → get access token
2. `GET https://manage.wix.com/apps-service/v1/apps/{appId}?withSecrets=true` with headers:
   - `Authorization: {token}`
   - `X-XSRF-TOKEN: nocheck`
   - `Cookie: XSRF-TOKEN=nocheck`
3. Response: `{ app: { appSecrets: { appSecret: "...", webhookPublicKey: "..." } } }`

This means the interactive setup can be fully automated for appStrategy — no manual credential entry needed. The `appId` comes from `wix.config.json`, the `appSecret` from the Dev Center API, and the `oauthStrategy.clientId` is the same `appId`.

### What didn't work

- BaaS env variables API (`/v2/app-projects/{appId}/app-environment-variables/environment/production`) returned 404 — not usable for this purpose.

See `exploration/wix-app-secret/` for the validation script.

## Trade-offs

- **Discriminated union vs. optional fields**: Discriminated union (`kind` field) is more type-safe and makes the branching explicit. Slightly more verbose in the config loader, but prevents impossible states.
- **Keeping oauthStrategy separate vs. inferring from appId**: Inferring reduces config boilerplate for `appStrategy` users, but introduces an implicit relationship. Explicit keeps things predictable.

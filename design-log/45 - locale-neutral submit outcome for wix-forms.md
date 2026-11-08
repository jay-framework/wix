# 45 - Locale-Neutral Submit Outcome for wix-forms

Status: Implemented (2026-11-08)

Builds on **DL#41** (view state, `statusMessage`) and **DL#42** (`runSubmission`, the returned `SubmitFormResult`). Paths are relative to `packages/wix-forms/lib/` unless stated.

## Decisions for the Implementer (TL;DR)

- **Two new form-level enum variants on every generated `form/<slug>` contract:**
  - `submitState: enum (IDLE | SUBMITTING | SUCCEEDED | FAILED)`
  - `submitFailure: enum (NONE | VALIDATION | REJECTED | PERMISSION | NETWORK | UNKNOWN)`; `NONE` unless `submitState` is `FAILED`.
- **`statusMessage` stays.** It is the plugin's English **default copy**, not the signal. A page that needs its own words or another language branches on the variants and writes the text in jay-html.
- **`isSubmitting` / `isSubmitted` stay** (existing pages bind them). `submitState` is derived from them plus the failure, so there is one source of truth.
- **The reason is decided where the failure is decided.** The server adds `reason: SubmitFailure` to the failure result; the client sets `VALIDATION` (client checks) and `NETWORK` (transport throw).
- **Enum members are defined once** in `components/submit-outcome.ts` (client-safe) and the contract generator renders the `dataType` from them, so the contract order and the runtime numbers can't drift.
- **jay-feedback:** agent-kit, both sides. The plugin's `user-visible-messages.md` documents the variants; jay's plugin `contracts-guide.md` gets the general rule ("expose outcomes as variants, text is a default"). No validation (see §Agent Feedback Loop).

## Background

Today a failed submit is visible to the page only as a non-empty English `statusMessage` (`SUBMIT_FAILED_MESSAGE`, a hook `ActionError` message, or Wix field errors joined as text). The page cannot tell _why_ it failed, and cannot localize or redesign the message without matching on English text. Client-side validation leaves `statusMessage` empty, so that failure has no form-level signal at all.

Prior art in this repo: wix-stores `stockStatus` (`enum (OUT_OF_STOCK | IN_STOCK)`, the page writes the words); wix-members `auth-callback` and wix-cart's coupon (`hasError` + `errorMessage`).

## Design

### 1. Codes (`components/submit-outcome.ts`)

```ts
export enum SubmitState {
  IDLE,
  SUBMITTING,
  SUCCEEDED,
  FAILED,
}
export enum SubmitFailure {
  NONE,
  VALIDATION,
  REJECTED,
  PERMISSION,
  NETWORK,
  UNKNOWN,
}
```

Numeric, matching how jay compiles a contract `enum (...)` (`export enum X { A, B }`), so the view-state value is the member's index.

| `submitFailure` | Set by          | When                                                                                                                                             |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VALIDATION`    | client / server | client checks failed, or Wix returned per-field violations                                                                                       |
| `REJECTED`      | server          | Wix refused the submission (non-field), or a hook threw `ActionError`                                                                            |
| `PERMISSION`    | server          | Wix answered 401 / 403                                                                                                                           |
| `NETWORK`       | client          | the action call itself threw (offline, timeout, unexpected server throw)                                                                         |
| `UNKNOWN`       | server          | the server could not reach Wix (not a `WixApiError`), identity resolution failed, or the hook failed before submitting / never called `submit()` |

### 2. Result shape (`types.ts`)

```ts
| { success: false; reason: SubmitFailure; message?: string; fieldErrors?: Record<string, string> }
```

`runSubmission.settleSubmission` sets `reason` on every failure row.

### 3. Contract (`generators/contract-utils.ts`)

`reservedFormTags` adds both tags (`type: variant`, `phase: fast+interactive`); `RESERVED_TAG_NAMES` adds both names.

### 4. View state + component

`buildFormViewState` takes `submitFailure?: SubmitFailure` and derives `submitState`: `isSubmitted → SUCCEEDED`, else `isSubmitting → SUBMITTING`, else `failure ≠ NONE → FAILED`, else `IDLE`. `WixFormInteractive` keeps one new signal, `submitFailure`, cleared at submit start and on reset.

### 5. Page usage

```html
<p if="contact.submitState === FAILED">
  <span if="contact.submitFailure === NETWORK">Problème de connexion, réessayez.</span>
  <span if="contact.submitFailure === REJECTED">Nous n'avons pas pu envoyer le formulaire.</span>
</p>
<!-- English default is fine: -->
<p if="contact.statusMessage">{contact.statusMessage}</p>
```

## Trade-offs

- **Hook-specific codes deferred.** A hook's `ActionError` maps to `REJECTED` (its `message` still reaches `statusMessage`). Exposing the hook's own `code` needs a string tag compared in jay-html; add it when a consumer needs it.
- **Per-field `errorCode` deferred.** Wix's server messages are already translated; only the client templates are English.
- **No message-override config.** Copy belongs in jay-html, not `config/.wix-forms.yaml`.

## Agent Feedback Loop

- **Agent-kit:** yes (both docs above). **Validation:** no. Binding `{key.statusMessage}` is legitimate for English sites, so a warning would be noise.

## Implementation Results

Implemented as designed. Tests: wix-forms 130/130 (new: 4 `submitState` derivation cases; a `reason` on every `runSubmission` failure row, plus 401 and 500 rows). `yarn build` green.

- **Deviation:** a non-`WixApiError` failure inside `submit()` (the server could not reach Wix) maps to `UNKNOWN`, not `REJECTED`: Wix never answered, so nothing was refused. The §1 table was updated before code landed.
- **Verified against jay's compiler:** the generated contract parses both tags as enums and compiles them to `export enum SubmitState { IDLE, SUBMITTING, SUCCEEDED, FAILED }` and `export enum SubmitFailure { NONE, … }`, matching the plugin's enums.
- **Not verified in a browser:** no example app in this slice binds a form contract (the testbed is a later slice).
- **Docs fixed in passing:** `user-visible-messages.md` claimed a successful submit sets `statusMessage` to "Form submitted successfully."; it hasn't since DL#42.
- **jay agent-kit (same branch name in jay):** `plugin/contracts-guide.md` §Outcomes and User-Visible Text (the general rule for plugin authors) and `designer/contracts-and-plugins.md` §Plugin messages are defaults (the page-builder side).

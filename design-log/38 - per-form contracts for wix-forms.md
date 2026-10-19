# 38 - Per-Form Contracts for wix-forms

Status: Draft

## Decisions for the Implementer (TL;DR)

- **Reuse the `wix-data` mechanism wholesale.** Generate one contract **per Wix form** during the **jay agent-kit phase** (`jay-stack agent-kit`) — the plugin's `dynamic_contracts` + `agentkit` handler + `makeContractGenerator()`, materialized by the contract-materializer, exactly the same timing as `wix-data`. **No new framework surface, no `jay` changes.** (Null hypothesis holds — see Prior Art.)
- **Retire the single generic contract.** Delete the static `wix-form` contract (the generic repeated `fields` sub-contract) and its `contracts:` entry in `plugin.yaml`. Replace with a `dynamic_contracts` entry (`prefix: form`). This is an experimental framework — **no backward-compat shim** for the generic `fields` tag.
- **Per-form contract shape:** each **visible** form field becomes a **named `sub-contract` tag named after the field's `target`** (e.g. `firstName`, `email`, `message`). Each field tag carries `label`/`placeholder`/`required`/`error` data+variant tags and one `input` interactive tag whose `elementType` is chosen per field type (`HTMLInputElement` / `HTMLTextAreaElement` / `HTMLSelectElement`). Select/choice fields also get a repeated `options` sub-contract. Form-level status tags (`isSubmitting`, `statusMessage`, `loadError`, `submitButton`) are reserved and kept at the top level.
- **Naming / binding:** contract name = `form/<slug>` where **`<slug>` is the kebab-cased form NAME**; when names collide, **each** colliding form gets a suffix from its own id (ordering-independent — Note B in OQ-5), e.g. `form/contact-a1b2` and `form/contact-9f3c`. A page binds a specific form with `contract="form/contact"` and then uses explicit paths: `{contact.email.label}`, `ref="contact.email.input"`, `ref="contact.submitButton"`. The generator attaches `metadata: { formId }`; the shared `wixForm` component reads `DynamicContractProps<{ formId }>.metadata` to know which form to load — exactly as `collectionItem` reads `{ collectionId }`. (OQ-5 resolved.)
- **Discovery / when — auto-enumeration during the agent-kit phase.** Generation runs when `jay-stack agent-kit` executes the plugin's `dynamic_contracts` generator + materialization (not at request time, not during the plugin's own `npm run build`) — identical timing to `wix-data`. The generator calls the Wix **List Forms** API (`GET /form-schema-service/v4/forms?namespace=…`) and generates **one contract per returned form directly from its `formFields`** — mirroring `wix-data`'s `listDataCollections` auto-seed. No per-form `getFormSchema` call is needed at generation time (List returns the full field schema). `config/.wix-forms.yaml` is now an **optional filter/override** (restrict to specific `formIds`, supply the `namespace`), **not** the source of truth. The `namespace` query param is required — see OQ-8. (OQ-1 resolved.)
- **Feedback loop (both):**
  - **agent-kit** — add `packages/wix-forms/agent-kit/plugin/per-form-contracts.md` teaching per-form generation, the `form/<slug>` naming, field-named binding, and the removal of the generic `fields` tag; add a build-time discovery reference `forms.yaml` via the `agentkit:` handler (analogous to `wix-data`'s `collections.yaml`).
  - **validation** — add a **wix-forms plugin validator** (`JayHtmlValidatorFn` exported from `./tools`, declared under `validators:` in `plugin.yaml`) that flags use of the retired generic `fields` tag with a migration message. Unknown-field-tag binding leans on core contract-binding validation (see OQ-3 / Validations section — partly deferred).

---

## Background

`@jay-framework/wix-forms` renders a Wix Form by ID. Today it ships **one static, generic contract** `wix-form.jay-contract` used for **every** form:

- The contract (`packages/wix-forms/lib/contracts/wix-form.jay-contract:9-32`) exposes a generic repeated `fields` sub-contract with `target`, `label`, `inputType`, `isTextarea`, `required`, `placeholder`, `hasOptions`, plus three interactive refs (`formInputs`/`formTextareas`/`formSelects`) and a sibling repeated `options` sub-contract keyed by `fieldTarget`.
- `plugin.yaml:4-8` declares it as a **static** contract (`contracts:` entry) bound to the `wixForm` component.
- At runtime the `wixForm` component loads the form schema in the **slow** phase (`components/wix-form.ts:60-83` → `forms.getFormFields(props.formId)`), projects raw Wix fields into `FormFieldView[]` (`utils/project-form-fields.ts:38-68`), and renders them into the generic `fields`/`options` arrays (`toContractFields`, `flattenOptions` — `components/wix-form.ts:33-58`).
- The service fetches a single form by ID via `getFormSchema(client, formId)` → raw `wixFetch` to `/form-schema-service/v4/forms/${formId}` (`wix-apis/get-form.ts:39-43`; `services/wix-forms-service.ts:15-29`).
- Config is a single `defaultFormId` string (`config-loader.ts:5-22`, `setup.ts:8-12`).

So the page author binds through anonymous positional loops: `forEach="contact.fields"`, `{target}`, `ref="contact.fields.formInputs"`. The design surface tells you *nothing* about which fields the form actually has.

## Problem

One generic contract for all forms means:

1. **Opaque bindings.** A designer/agent cannot see `firstName`, `email`, `message` in the contract — only a generic `fields` array. Page code binds by iterating and matching `target` strings, which are invisible until runtime.
2. **No design-time safety.** Referencing a field that does not exist on the form (typo, wrong form) cannot be caught; the generic contract validates any `fields.*` access.
3. **Per-field layout is awkward.** Custom markup per field (a two-column name row, a styled country select) requires `if="…target==='firstName'"`-style gymnastics inside one loop.

We want **a separate contract per form, with tags named after that form's real fields**, so page code and bindings are explicit and checkable — the same win `wix-data` already delivers for collections.

## Prior Art / Adjacent Mechanisms

### `wix-data` generates one contract per collection at build time (same repo) — the template to copy

- **Declared in `plugin.yaml`** via `dynamic_contracts` (`packages/wix-data/plugin.yaml:6-25`): each entry has `prefix`, `component`, `generator`. e.g. `prefix: item` → `component: collectionItem` → `generator: itemContractGenerator`.
- **Generator** is built with jay's `makeContractGenerator()` (`packages/wix-data/lib/generators/item-contract-generator.ts:55-73`): `.withServices(WIX_DATA_SERVICE_MARKER).generateWith(async (svc) => schemas.map(schema => ({ name, yaml, description, metadata: { collectionId } })))`. It returns `GeneratedContractYaml[]` — one entry per visible collection.
- **Contract YAML is built from the schema**: `buildContract(schema)` emits a `name:` + `tags:` block, one tag per field via `fieldToTag` (`lib/generators/contract-utils.ts:163-188`) which maps Wix field categories → tag kinds (image/media/address sub-contracts, reference→data, etc.). ✅ verified.
- **Config lists the collections** (`config/wix-data.yaml`), auto-generated on first init by listing collections from the Wix API (`lib/config-loader.ts:35-54,160-263` via `collections.listDataCollections({})`) and defaulting all to `visible: false`. The service caches fetched schemas (`lib/services/wix-data-service.ts:107-168`).
- **The shared component is schema-agnostic**: `collectionItem = makeJayStackComponent<any>().withProps<PageProps & DynamicContractProps<WixDataMetadata>>()` and reads `props.metadata!.collectionId` to know which collection to serve (`lib/components/collection-item.ts:83-88,242-246`). One component, many contracts. ✅ verified.
- **Discovery reference** for agents is emitted by the `agentkit:` handler (`packages/wix-data/plugin.yaml:38`, `lib/setup.ts:71-172`) → writes `agent-kit/references/wix-data/collections.yaml`. ✅ verified.

### jay's plugin build mechanism (public surface only)

- **`dynamic_contracts` entries** (`prefix`, `component`, `generator`) are read by the **contract-materializer** at build / `jay-stack agent-kit` time. For each generated contract it writes `agent-kit/materialized-contracts/<plugin>/<prefix>-<kebab-name>.jay-contract` and registers the contract name as **`<prefix>/<kebab-name>`** (single-contract generators omit the name and use just `<prefix>`). Multiple contracts **require** a `name`. ✅ verified (`jay/packages/jay-stack/stack-server-build/lib/contract-materializer.ts:510-583`). Real output example: `examples/cms/agent-kit/materialized-contracts/wix-data/item-recipes-item.jay-contract`, referenced in a page as `contract="item/recipes-item"` (`examples/cms/src/pages/recipes/[slug]/page.jay-html:11`). ✅ verified.
- **`makeContractGenerator()`** fluent builder — `.withServices(...).generateWith(fn)` returning `{ services, generate }`; `generate` returns `GeneratedContractYaml[]` = `{ name?, yaml, description?, metadata? }` (`jay/packages/jay-stack/full-stack-component/lib/contract-generator-builder.ts:36-115`, `lib/jay-stack-types.ts:269-296`). ✅ verified.
- **`DynamicContractProps<TMetadata>`** = `{ contractName: string; metadata?: TMetadata }` — the runtime passes the generator's `metadata` to the shared component (`jay/packages/jay-stack/full-stack-component/lib/jay-stack-types.ts:63-68`). ✅ verified.
- **Plugin validators**: `plugin.yaml` may declare `validators: [{ name, handler, description }]`; `handler` is an exported `JayHtmlValidatorFn` = `(ctx: JayHtmlValidationContext) => JayHtmlValidationFinding[] | Promise<…>` (`jay/packages/compiler/compiler-shared/lib/plugin-validators.ts:25-56`; example `jay/packages/plugins/seo-validator/plugin.yaml:3` + `lib/validators/seo-validator.ts:15`). The context exposes the page's `contract` and `headlessImports[].contract` (tags), `validationOverrides`, `head`, `css`. ✅ verified.

### Null hypothesis: does `wix-data`'s mechanism already solve per-form generation?

**Yes — and the precedent now extends to *enumeration* too, not just per-schema generation.** Per-form contracts are structurally identical to per-collection contracts: enumerate N site-specific schemas, emit N named contracts with field-named tags, serve them all from one schema-agnostic component selected by `metadata`. `wix-data` auto-seeds its collection set by listing from the platform API (`collections.listDataCollections({})`, `lib/config-loader.ts:160-263`); wix-forms does the direct analogue with **List Forms** (`GET /form-schema-service/v4/forms`, OQ-1). The one *intentional* deviation is the default scope: wix-data is opt-in (`visible: false` per collection) whereas wix-forms is **opt-out** — all enabled forms generate by default (Note A in OQ-1). Every primitive needed already exists and is exercised in-repo. **We invent no new surface** — we only add a thin `wix-apis/list-forms.ts` wrapper over an endpoint the plugin already talks to (`wix-apis/get-form.ts` hits the same `form-schema-service/v4`). Any proposal to add new framework/plugin surface beyond a generator + a List-Forms wrapper + a shared-component refactor must justify itself against this.

## Questions and Answers (open where unanswered)

**OQ-1 — How are the user's forms enumerated at build time?**
`wix-data` lists collections via `collections.listDataCollections({})`. wix-forms today has **no list endpoint** — only `getFormSchema(client, formId)` by ID (`wix-apis/get-form.ts:39-43`). Design assumes a config-listed set of forms (`forms: [{ formId, name }]`) in `config/.wix-forms.yaml`, mirroring `wix-data.yaml`. ⚠️ **assumed**: a Wix Forms "list/query forms" REST endpoint exists to *auto-seed* that list on first init (as `wix-data` auto-seeds collections). If it does not, the list is authored manually. **Open: confirm the list-forms API (path/SDK) before building auto-seed; otherwise ship manual config and defer auto-seed to its own DL.**

**ANSWER (RESOLVED — auto-enumerate; changes the design):** The platform **does** expose a list endpoint; the plugin simply hadn't wrapped it. Switch from "config-listed baseline, defer auto-seed" to **auto-enumeration at build time via List Forms**, the direct analogue of `wix-data`'s `listDataCollections` auto-seed.
- **List Forms:** `GET https://www.wixapis.com/form-schema-service/v4/forms` — **required** query param `namespace` (minLength 10, see OQ-8); optional `enabled`/`disabled`, `formIds`, `nameFilter`, `order`, `paging` (CursorPaging, `limit` 0-100 + `cursor`), `fieldsets`. Scope `SCOPE.FORMS.VIEW-FORM`. ⚠️ assumed (API facts supplied by owner, not re-read from SDK types in this repo).
- Response `ListFormsResponse`: `forms[]`, each `{ id, formFields[] }`, and **`formFields` carries the FULL field schema** (input types, validation, labels). So **List alone yields everything needed to generate every per-form contract** — the generator does **not** need a per-form `getFormSchema` call at generation time. Paging via cursor handles >100 forms. ⚠️ assumed.
- Alternative: `POST …/v4/forms/query` (Query Forms) for filter/sort — same `{ id, formFields[] }` shape. ⚠️ assumed.
- This is the **same `form-schema-service/v4`** the existing `wix-apis/get-form.ts:39-43` already calls via `wixFetch`. **Decision:** add a sibling `wix-apis/list-forms.ts` in that same `wixFetch` pattern (keep `getFormSchema` for the **runtime** component load by formId). Prefer this over the `@wix/crm` `formSchemas` SDK for consistency with the existing wixFetch approach, unless that SDK is already a dependency — it is not in `package.json` today, so `wixFetch` it is.
- **Config role flips:** `config/.wix-forms.yaml` is now an **optional filter/override**, not the source of truth — it may restrict generation to specific `formIds`, carry the `namespace`, or toggle `enabled`/`disabled`. Absent config, all forms in the namespace are generated.
- **Note A — enumeration is opt-OUT (conscious divergence from wix-data).** By default **every enabled form in the resolved namespace gets a contract**; the optional `formIds`/`include` config is the scope-*down*. This is a **deliberate divergence** from `wix-data`'s opt-*in* model (collections default `visible: false` and must be enabled one-by-one, `lib/config-loader.ts:233-238`). Rationale: forms are far fewer and lighter than collections and are almost always all wanted on the site, so opt-out is the lower-friction default; a stray contract costs little. **Possible future refinement:** an opt-in-per-form toggle (e.g. `include: []` whitelist as the default) if sites accumulate many unwanted forms — deferred, not v1.

**OQ-2 — Auth/caching at generation time?**
The generator runs in the same build context as `wix-data`'s (authenticated `WIX_CLIENT_SERVICE` available via `init`, `lib/init.ts:7-18`). It must fetch each listed form's schema. Decision: add schema caching to `WixFormsService` (map `formId → FormFieldView[]`) so the generator, the discovery reference, and the slow-phase render share one fetch — mirrors `wix-data`'s `processedSchemaCache`. ⚠️ assumed the build has network + credentials, same as `wix-data` today.

**ANSWER (CONFIRMED):** Same build-time auth path as `wix-data`. The generator's service (`WIX_FORMS_SERVICE`) obtains the authenticated client exactly as today's `init` does (`getService(WIX_CLIENT_SERVICE)`, `lib/init.ts:7-18`; `wix-data` does the identical thing in `lib/init.ts:26-36`), so the List Forms call authenticates at build with the site API key — no new auth surface. **Caching is scoped to the agent-kit build process only**: the generator caches the **List result** (`formId → formFields`/`FormFieldView[]`) so List is fetched once and reused by the generator and the `forms.yaml` discovery reference within that build. This cache is **not** shared with the runtime SSR slow-phase load, which runs in a separate process and still fetches by id via `getFormSchema(formId)` (`wix-apis/get-form.ts:39-43`). ⚠️ assumed the List scope (`SCOPE.FORMS.VIEW-FORM`) is covered by the existing Wix Forms API-key permission the plugin already requires for `getFormSchema`/submit (`agent-kit/plugin/wix-forms-setup.md:28-34`).

**OQ-3 — How are field `target`s sanitized into tag identifiers, and how do we avoid collisions with reserved form-level tags (`isSubmitting`, `statusMessage`, `loadError`, `submitButton`)?**
Proposed: field tag = sanitized `target` (kebab/camel per existing contract tag rules); if a sanitized target collides with a reserved name, suffix or namespace it, and the validator reports it. **Open: exact sanitization rule and collision policy.** (A heavier alternative — nest all fields under one `fields` object tag — is rejected: it reintroduces a generic grouping and defeats the goal.)

**OQ-4 — Hidden and exotic fields.**
Today `projectFormFields` drops hidden fields (`!field.hidden`, `utils/project-form-fields.ts:44`) and only text-like/select inputs survive. Decision for v1: **the contract exposes only visible, bindable fields** (hidden fields are still submitted by the component but are not design surface). Multi-value/choice fields map to a `select` + repeated `options`. File-upload / signature / payment / multi-select-checkbox group representation is **out of scope** (Scope pre-mortem). **Open: confirm hidden fields never need a binding.**

**OQ-5 — Contract naming source: form name vs form id.**
Form `name` is human-friendly but can change or duplicate; `formId` (GUID) is stable but ugly in `contract="form/…"`. Proposed: slug from `name`, de-duplicated; keep `formId` only in `metadata`. **Open: what to do when two forms share a name (append short id?).**

**ANSWER (RESOLVED):** Slug from the form **NAME** (kebab-cased) → `form/<slug>`. `formId` stays only in `metadata`.

**Note B — deterministic, ordering-independent dedup.** When **≥2 forms** produce the same `<kebab-name>`, **every colliding form gets an id suffix derived from its own form id** — none is left bare based on arrival order. So two "Contact" forms become `form/contact-a1b2` and `form/contact-9f3c` (never `form/contact` + `form/contact-9f3c`). This guarantees a given form's slug depends only on **its own** name+id, not on List-response order or on which other forms happen to exist that build — a page bound to `form/contact-a1b2` never silently re-points when the form set changes. Non-colliding names stay bare (`form/newsletter`). (Implementation note: group by kebab-name; for any group of size >1, suffix each member with a stable prefix of its own id; the suffix length is fixed/collision-checked. A name that collides in one build but not another would change slug — acceptable, and surfaced by re-running agent-kit + the downstream validate step.)

**OQ-6 — Does the `formId` prop still override the contract's form?**
Today `formId` is a free prop with `defaultFormId` fallback. With per-form contracts the form identity is fixed by the contract's `metadata.formId`. Decision: the selected contract *is* the form; the `formId` prop is **removed** from the per-form contract (the metadata carries it). The default-form escape hatch goes away. **Open: confirm no page relies on runtime form switching.**

**ANSWER (RESOLVED):** Drop the runtime `formId` prop override **entirely**. The contract's `metadata.formId` is the sole source of form identity; there is no `formId` prop and no `defaultFormId` fallback. (Folded into §6 Migration.)

**OQ-7 — Relationship to `getFormSummary` (cross-plugin).**
`wix-bookings` consumes participant fields via the `getFormSummary` action, **not** the `wix-form` UI contract (`agent-kit/plugin/wix-forms-setup.md:56-64`). That path is untouched by this DL. Out of scope.

**OQ-8 — How is the required `namespace` for List Forms determined? (NEW — OPEN)**
List Forms requires a `namespace` query param (minLength 10). Standalone Wix Forms live under the Wix Forms app namespace (commonly `"wix.form_app.form"`), while forms belonging to other apps (bookings, events, etc.) use that app's namespace — so a single site can span multiple namespaces. **Recommended default:** generate for the standard standalone Wix Forms namespace **`"wix.form_app.form"`** when none is configured, and allow `config/.wix-forms.yaml` to **override or supply additional namespaces** (array). ⚠️ **assumed**: the exact standalone-forms namespace string — the builder MUST confirm it against a real site's List Forms response before shipping (one `GET …/v4/forms?namespace=wix.form_app.form` call), and should surface a clear error if the namespace returns zero forms. **Open: confirm the canonical namespace string and whether multi-namespace enumeration is in scope for v1 (recommend: v1 = the single standalone-forms namespace; multi-namespace deferred).**

## Design

### 1. Discovery and timing — auto-enumerate via List Forms

- **The generator auto-enumerates forms** by calling Wix **List Forms** (`GET /form-schema-service/v4/forms?namespace=…`, OQ-1) through a new `wix-apis/list-forms.ts` (same `wixFetch` pattern as `wix-apis/get-form.ts:39-43`), paging the cursor until exhausted. It builds **one contract per returned form straight from that form's `formFields`** — no per-form `getFormSchema` call at generation time. This is the direct analogue of `wix-data` auto-seeding collections from `listDataCollections` (`lib/config-loader.ts:160-263`).
- **`config/.wix-forms.yaml` is an optional filter/override, not a form list.** It is retired as the source of truth; the lone `defaultFormId` string is removed (OQ-6). Shape:
  ```yaml
  # Optional. Absent → generate every form in the default namespace.
  namespace: "wix.form_app.form"   # OQ-8; omit to use the recommended default
  formIds: []                       # optional whitelist — restrict generation to these
  include: enabled                  # optional: enabled | disabled | all (maps to List Forms enabled/disabled)
  ```
- **The `namespace` query param is required** by List Forms; its value and multi-namespace scope are tracked in OQ-8 (recommended default `"wix.form_app.form"`, confirm before shipping).
- **Generation runs in the jay agent-kit phase** — when `jay-stack agent-kit` runs, the contract-materializer invokes the plugin's `dynamic_contracts` generator (service-injected, authenticated client) and the `agentkit` handler emits the discovery reference. This is **the same phase/timing as `wix-data`**; there is no request-time generation and no generation during the plugin package's own `npm run build`.

### 2. `plugin.yaml` change

Remove the static `contracts:` entry for `wix-form`; add a dynamic one and the discovery + validator hooks:

```yaml
name: wix-forms

dynamic_contracts:
  - prefix: form
    component: wixForm
    generator: formContractGenerator

services:
  - name: wix-forms
    marker: WIX_FORMS_SERVICE
    description: Server-side Wix Forms schema and submission APIs

actions:
  - name: getFormSummary
    action: get-form-summary.jay-action
  - name: submitForm
    action: submit-form.jay-action

validators:
  - name: wix-forms-bindings
    handler: validateWixFormBindings
    description: Flags retired generic `fields` binding and unknown form-field tags

setup: setupWixForms
agentkit: generateWixFormsAgentKit
```

### 3. Per-form contract shape

One contract per form, **field-named tags**. Example for a Contact form with `firstName`, `email`, `message` (textarea), `country` (select):

```yaml
name: ContactForm
description: Contact form (Wix form f1a2…)
tags:
  - tag: firstName
    type: sub-contract
    phase: fast+interactive
    description: First name
    tags:
      - { tag: label, type: data, dataType: string }
      - { tag: placeholder, type: data, dataType: string }
      - { tag: required, type: variant, dataType: boolean }
      - { tag: error, type: data, dataType: string }
      - { tag: input, type: interactive, elementType: HTMLInputElement }

  - tag: email
    type: sub-contract
    phase: fast+interactive
    description: Email (format EMAIL)
    tags:
      - { tag: label, type: data, dataType: string }
      - { tag: placeholder, type: data, dataType: string }
      - { tag: required, type: variant, dataType: boolean }
      - { tag: error, type: data, dataType: string }
      - { tag: input, type: interactive, elementType: HTMLInputElement }

  - tag: message
    type: sub-contract
    phase: fast+interactive
    description: Message
    tags:
      - { tag: label, type: data, dataType: string }
      - { tag: placeholder, type: data, dataType: string }
      - { tag: required, type: variant, dataType: boolean }
      - { tag: error, type: data, dataType: string }
      - { tag: input, type: interactive, elementType: HTMLTextAreaElement }

  - tag: country
    type: sub-contract
    phase: fast+interactive
    description: Country
    tags:
      - { tag: label, type: data, dataType: string }
      - { tag: required, type: variant, dataType: boolean }
      - { tag: error, type: data, dataType: string }
      - { tag: input, type: interactive, elementType: HTMLSelectElement }
      - tag: options
        type: sub-contract
        repeated: true
        trackBy: value
        tags:
          - { tag: value, type: data, dataType: string }
          - { tag: label, type: data, dataType: string }

  # reserved, form-level tags (unchanged semantics from the generic contract)
  - { tag: isLoading, type: variant, dataType: boolean, phase: fast+interactive }
  - { tag: loadError, type: data, dataType: string, phase: fast+interactive }
  - { tag: isSubmitting, type: variant, dataType: boolean, phase: fast+interactive }
  - { tag: statusMessage, type: data, dataType: string, phase: fast+interactive }
  - { tag: submitButton, type: interactive, elementType: HTMLButtonElement }
```

**Field type → contract mapping** (driven by the existing `FormFieldView` projection, `utils/project-form-fields.ts:20-68`; `types.ts:1-18`):

| Wix / `FormFieldView` | `input.elementType` | extra |
|---|---|---|
| `text`, `email`, `tel`, `url` | `HTMLInputElement` | — |
| `textarea` | `HTMLTextAreaElement` | — |
| `select` (has options) | `HTMLSelectElement` | repeated `options` sub-contract |

- **Required/optional** → a `required` **variant** tag per field (so the view can branch on it) plus server+client validation already in `validateFormField` (`utils/project-form-fields.ts:113-146`).
- **Hidden fields** → excluded from the contract (OQ-4); still submitted by the component.
- **Repeated/multi-value** → choice fields expose repeated `options`; true multi-value (checkbox group / multi-select) is deferred (Scope pre-mortem).
- Field-level `inputType`/format is encoded structurally (element type) rather than as a generic `inputType` string — bindings become explicit.

### 4. The generator (design, not code)

`formContractGenerator = makeContractGenerator().withServices(WIX_FORMS_SERVICE).generateWith(async (forms) => …)`:
1. **List** all forms via the service's List-Forms call (`namespace` from config/OQ-8; apply optional `formIds`/`enabled` filter from config), paging the cursor to completion (OQ-1). Each returned form already carries `formFields` — no per-form fetch.
2. For each form, project `formFields` → `FormFieldView[]` (reuse the existing `projectFormFields`, `utils/project-form-fields.ts:38-68`), then slug the form `name`; resolve duplicate-name collisions by suffixing **every** colliding form with a stable prefix of its own id (ordering-independent — Note B in OQ-5).
3. Emit `{ name: '<PascalName>Form', yaml: <built from fields>, description, metadata: { formId } }`.
Returns one `GeneratedContractYaml` per form. The materializer writes `agent-kit/materialized-contracts/wix-forms/form-<slug>.jay-contract` and registers the name `form/<slug>`. (Reuse `contract-utils`-style tag builders; those live in `wix-data` — either port the small helpers into `wix-forms` or extract a shared util. Decision: **copy the few needed builders into wix-forms** to keep packages independent; do not cross-import `wix-data` internals.)

### 5. Shared component refactor

`wixForm` moves from `makeJayStackComponent<WixFormContract>().withProps<WixFormProps>()` to the `wix-data` pattern:
`makeJayStackComponent<any>().withProps<DynamicContractProps<{ formId: string }>>().withServices(WIX_FORMS_SERVICE)`. The slow phase reads `props.metadata!.formId`, loads that form, and builds a **view-state object keyed by field `target`** (`{ firstName: { label, placeholder, required, error: '' }, email: {…}, country: { …, options: [...] } }`) plus the reserved form-level fields — instead of the generic `fields`/`options` arrays (`components/wix-form.ts:48-58` logic is replaced by a per-target mapper). The interactive phase reads values through `refs.<target>.input` and submits by `target` (same `readFormValues`/`submitForm` flow, keyed differently). `getFormSummary`/`submitForm` actions are unchanged.

### 6. Migration (retire the generic contract)

- Delete `lib/contracts/wix-form.jay-contract` and its `package.json` export + `plugin.yaml` `contracts:` entry.
- **Remove the runtime `formId` prop override entirely** — delete `WixFormProps.formId` and the `defaultFormId` fallback (OQ-6 resolved). Form identity comes solely from the contract's `metadata.formId`; there is no page-level way to switch forms at runtime. Config changes from the single `defaultFormId` string to the optional filter/override shape in §1 (`namespace`/`formIds`/`include`).
- **Remove the top-level repeated `fieldErrors` tag** (`wix-form.jay-contract:60-67`, fed by `parseSubmissionFieldErrors`). Submission errors are no longer a separate sibling array keyed by `target`; instead the component maps each returned error (by `target`) into that field's **per-field `error` data tag** (`<key>.<field>.error`). `parseSubmissionFieldErrors` is retained but its output is now written into the per-field view-state slots rather than a flat `fieldErrors` array.
- No shim for the generic `fields` tag. Pages using `contract="wix-form"` + `forEach="…fields"` break and must migrate to `contract="form/<slug>"` + explicit field paths. The plugin validator (below) gives the migration message.

### 7. Does `jay` need changes?

**No.** `dynamic_contracts`, `makeContractGenerator`, `DynamicContractProps`, the contract-materializer, `agentkit:`/`setup:` handlers, and `validators:` + `JayHtmlValidatorFn` are all existing jay **public surface**, already used by `wix-data` and the validator plugins in-repo (citations in Prior Art). This DL is **fully within the `wix-forms` plugin**. We deliberately did not branch `jay`.

## Agent Feedback Loop

### agent-kit (what agents must learn)

Add `packages/wix-forms/agent-kit/plugin/per-form-contracts.md` teaching:
- Generation is **build-time, per form**; forms are **auto-enumerated** from the site via List Forms (no manual list). `config/.wix-forms.yaml` only optionally filters (namespace / formIds).
- Contracts are named **`form/<slug>`**; discover available forms + their fields from the generated **`agent-kit/references/wix-forms/forms.yaml`** (emitted by the `agentkit:` handler — field names, types, required, element types) and from the materialized `form-<slug>.jay-contract`.
- **Binding is explicit**: `{contact.email.label}`, `ref="contact.email.input"`, `<option forEach="contact.country.options" trackBy="value">`, `ref="contact.submitButton"`.
- The generic `fields` tag is **gone** — never write `forEach="…fields"`.

Also update `agent-kit/plugin/wix-forms-setup.md:41-54` (the "Page form" snippet currently shows `contract="wix-form"` + `forEach fields`).

### jay validations (deterministic checks)

**Decision: a wix-forms *plugin* validator** (`JayHtmlValidatorFn` exported from `./tools`, declared under `validators:` in `plugin.yaml`), named `wix-forms-bindings`. It fires in two detectable situations, both carrying the DL#38 migration message ("the generic `fields` tag was removed in DL#38; bind explicit field tags like `<key>.email.input`"):

  1. **Leftover `.fields` binding on a migrated import (the reliably-detectable case):** a page that imports a per-form contract (`ctx.headlessImports[].contractName` starts with `form/`) and still binds `<key>.fields` / `forEach="<key>.fields"`. This is the case the validator is *guaranteed* to see, because the `form/` import resolves and appears in `headlessImports`. ✅ (mechanism verified: `headlessImports[].contractName` + `.contract.tags` are populated — `plugin-validators.ts:46-51`.)
  2. **Direct reference to the retired name `wix-form` (best-effort):** a page still importing `contract="wix-form"`. After migration the static `wix-form` contract no longer exists, so core resolution raises a generic "unknown contract" with **no** migration hint. To emit the friendlier DL#38 message here, the plugin validator keys on the **literal string `wix-form`** appearing as a `contractName` in `ctx.headlessImports[]`. ⚠️ **assumed**: that an *unresolved* contract name still surfaces in `headlessImports[].contractName` (not dropped before plugin validators run) — **not confirmed**. If it does not surface, case 2 is not achievable from a plugin validator and the user sees only core's generic "unknown contract `wix-form`" error; case 1 remains the guaranteed migration path.

  Retired-`fields` detection is **plugin-specific knowledge** (it knows the old shape) → belongs in the plugin, not core.
- **Unknown-field-tag binding (deferred, with a gate):** a binding to `<key>.<missingField>` where `<missingField>` is not a tag of the selected form's contract. `ctx.headlessImports[].contract.tags` carries the generated field tags, so the check is feasible in the plugin validator. **Decision: prefer core contract-binding validation.** The implementer **MUST verify** — before closing this item — whether core `validate` already rejects a binding to a non-existent contract sub-tag (e.g. `<key>.notAField` / `<key>.email.notATag`). **If core does NOT reject unknown sub-contract paths, the wix-forms plugin validator MUST add this check** (iterate bound paths under each `form/` import's key against `contract.tags`). Do not close as "covered" without that verification.

Rationale (jay prevention order: validation → agent-kit → framework): both additions are validation+docs; **no framework code**.

## Implementation Plan

1. **List-Forms wrapper + config.** Add `wix-apis/list-forms.ts` (`wixFetch` over `GET /form-schema-service/v4/forms?namespace=…`, cursor paging) and a service method that lists+caches (`formId → formFields`/`FormFieldView[]`, OQ-2). Confirm the `namespace` value against a real site (OQ-8). Change `WixFormsConfig` from `{ defaultFormId }` to the optional filter/override `{ namespace?, formIds?, include? }`; update `config-loader.ts` + `setup.ts` template.
2. **Generator.** Add `formContractGenerator` (`makeContractGenerator`): List → project `formFields` → per-form contract; tag builders (ported, §4), slug + duplicate-name id-suffix (OQ-5), reserved-tag collision handling (OQ-3). Unit-test the generated YAML with `parseContract()` + `toEqual` on fixtures (per repo testing standard; **write the correct expected contract first**, no false green).
3. **plugin.yaml.** Swap static `contracts:` → `dynamic_contracts` (`prefix: form`); add `agentkit:` + `validators:`.
4. **Component.** Refactor `wixForm` to `<any>` + `DynamicContractProps<{ formId }>`; per-target view-state mapper; keep submit/validate flow.
5. **Discovery reference.** `generateWixFormsAgentKit` → `agent-kit/references/wix-forms/forms.yaml` (mirror `wix-data/lib/setup.ts:71-172`).
6. **Validator.** `validateWixFormBindings` (retired-`fields` rule first).
7. **agent-kit docs.** New `per-form-contracts.md`; fix `wix-forms-setup.md` snippet.
8. **Migration.** Delete the static contract + exports/props; update any example page to the new binding; run example `npm run validate`.
9. **Downstream verification & propagation.** Once the plugin change builds and unit tests pass, propagate the change to the **consuming site**: bump/sync the new `@jay-framework/wix-forms` version into the site, regenerate its agent-kit (`jay-stack agent-kit`, which materializes the per-form contracts), run the site's `validate`, migrate the site's form bindings (generic `fields` loops → explicit per-form field tags), and QA the running site — capture a demo video of a form rendering and submitting via its per-form contract. (The concrete, site-specific propagation playbook lives **outside this repo**; it is not inlined here.)

## Examples

**Before (generic, opaque):**
```html
<script type="application/jay-headless" plugin="@jay-framework/wix-forms"
        contract="wix-form" key="contact"></script>
<form>
  <label forEach="contact.fields" trackBy="target">
    {label}
    <input ref="contact.fields.formInputs" placeholder="{placeholder}" if="!isTextarea && !hasOptions"/>
  </label>
  <button ref="contact.submitButton">Send</button>
</form>
```

**After (per-form, explicit):**
```html
<script type="application/jay-headless" plugin="@jay-framework/wix-forms"
        contract="form/contact" key="contact"></script>
<form>
  <label>{contact.firstName.label}
    <input ref="contact.firstName.input" placeholder="{contact.firstName.placeholder}"/>
    <span class="error" if="contact.firstName.error">{contact.firstName.error}</span>
  </label>
  <label>{contact.email.label}
    <input ref="contact.email.input" placeholder="{contact.email.placeholder}"/>
  </label>
  <label>{contact.message.label}
    <textarea ref="contact.message.input"></textarea>
  </label>
  <label>{contact.country.label}
    <select ref="contact.country.input">
      <option forEach="contact.country.options" trackBy="value" value="{value}">{label}</option>
    </select>
  </label>
  <button ref="contact.submitButton">Send</button>
  <p if="contact.statusMessage">{contact.statusMessage}</p>
</form>
```

## Trade-offs

- **(+)** Explicit, checkable bindings; per-field custom layout is trivial; agents discover real field names from `forms.yaml` + materialized contract. Mirrors a proven in-repo mechanism → low framework risk.
- **(−)** Rebuild/re-materialize required when a form's fields change (same as `wix-data` collections) — stale contract if a form is edited in Wix without re-running `agent-kit`. The validator + discovery reference mitigate by surfacing drift.
- **(−)** Field `target`s become part of the design surface; renaming a field in Wix is a breaking change to pages. Acceptable and explicit (the point of the feature).
- **(−)** Loss of the runtime `formId`/`defaultFormId` escape hatch (OQ-6). Acceptable for an experimental framework; revisit if a real "pick a form at runtime" need appears.

## Verification Criteria

1. A site with ≥2 forms in the target namespace **auto-enumerates** (no manual config) and materializes ≥2 contracts `form/<a>`, `form/<b>` under `agent-kit/materialized-contracts/wix-forms/`, each with **tags named after that form's fields** and correct `input.elementType` per type. Two forms sharing a `name` each produce a distinct, ordering-independent slug via an id suffix on **both** (Note B / OQ-5) — neither is left bare.
2. A page binding `{contact.email.label}` / `ref="contact.email.input"` / `forEach="contact.country.options"` validates clean and renders + submits end-to-end (values keyed by `target`).
3. `agent-kit/references/wix-forms/forms.yaml` lists each form's fields (name, type, required).
4. A page that imports a per-form contract (`contract="form/<slug>"`) but still binds the removed generic tag (`<key>.fields` / `forEach="<key>.fields"`) produces the plugin validator's **error** finding with the DL#38 migration message. (Best-effort: a page still importing the deleted `contract="wix-form"` *also* yields the migration message **if** the unresolved name surfaces in `headlessImports[].contractName` — ⚠️assumed; otherwise core emits a generic "unknown contract" error.)
5. No `jay` repo change is required to achieve 1-4.
6. Enumeration uses a single List Forms call (cursor-paged) and does **not** issue a per-form `getFormSchema` at generation time; the resolved `namespace` returns the expected forms (OQ-8 confirmed against a real site).
7. The **consuming site**, after syncing the new wix-forms version and regenerating agent-kit, **builds and `validate`s clean**, its migrated pages bind per-form field tags (no generic `fields` loops remain), and its forms render + submit via the per-form contracts in the running site (QA'd with a demo video).

## Scope Pre-mortem (what this will NOT handle)

- **File-upload / signature / payment / rating / multi-select-checkbox field types** → excluded from v1 contract shape (OQ-4). **Own DL** if needed.
- **Multi-step forms, sections, and Wix layout/order** → not modeled; fields are flat. **Defer.**
- **Conditional field visibility rules** from Wix → not reflected in the contract. **Defer.**
- **Multi-namespace enumeration** → v1 generates one `namespace` (OQ-8); forms owned by other apps (bookings/events) in other namespaces are **deferred** (config may supply additional namespaces later).
- **`getFormSummary` participant-form contract generation** (wix-bookings) → out of scope; that path stays dynamic (OQ-7).
- **i18n field labels / per-locale contracts** → **defer.**
- **Runtime form switching via `formId` prop** → removed (OQ-6); reintroduce only on real need.

# 60 - Field autocomplete, aria-invalid and error linkage rules for wix-forms

Status: [Implemented] (2026-11-23) — approved by product 2026-11-23. Safari / VoiceOver / native-autofill demos FAILED (not demonstrated) on the implementation machine; see Implementation Results.

Builds on **DL #41** Addendum A (accessible form pattern, bindings-validator a11y warnings), **DL #52** (address parts and their `autocomplete` tokens), **DL #59** (blur errors announced through `statusMessage`; per-field error elements are not live). Paths are relative to `packages/wix-forms/` unless stated. jay is referenced only by its public surface: the `@jay-framework/a11y-validator` plugin, its rule ids, `jay-stack validate`, the jay-html `<script type="application/jay-validations">` block, and the contract tag `meta` field. No consumer site is named.

## Decisions for the Implementer (TL;DR)

1. **Order: jay first — hard gate.** The generic form rules in `@jay-framework/a11y-validator` are **designed upstream, not shipped**. Phase 0 syncs jay and checks that every named rule id exists; Phase 1 does not start until they do. Nothing here re-checks what a generic rule checks.
2. **Validators first: three new warnings/errors in `lib/validators/wix-form-bindings.ts`**, each knowing something only the form contract knows:

   | Rule id | Severity | What only wix-forms knows |
   |---|---|---|
   | `wix-forms/field-autocomplete` | warning (missing) / **error** (wrong token) | the field's kind and Wix target (`email`, `tel`, `url`, `first_name`, `last_name`, address parts) → the one right token |
   | `wix-forms/field-invalid-unbound` | warning | `aria-invalid` must be bound to *this field's* `invalid` variant |
   | `wix-forms/field-error-undescribed` | warning | which element shows `{k.f.error}`, so the input's `aria-describedby` must list its id |

3. **The contract carries the field kind.** Each visible field sub-contract gets `meta: { kind: <inputType>, target: <wix target> }` (the public contract tag `meta` field). Pages must regenerate contracts; with an old contract the autocomplete rule falls back to address parts only and stays silent elsewhere.
4. **Messages are located and name the guide.** `[wix-forms/<rule-id>] ref="contact.email.input" …`; the suggestion ends with `See: wix-forms rich-forms.md §6` (path final only after spike 0c). The location goes in the message text because `jay-stack validate` output is expected to drop `element`/`attribute` — Phase 0e checks this against the synced CLI output.
5. **Suppression: the existing per-page block**, `wix-forms: { allow-<rule-id>: true }` in `<script type="application/jay-validations">`, read from `ctx.validationOverrides['wix-forms']` (same pattern as the a11y plugin). Page-wide only.
6. **No hint rule.** The contract has **no help-text tag** (Wix field descriptions are not read today), so "hint above field" stays guide-only. Adding a `hint` tag is a separate, later log (open question 2).
7. **Guides second**: fix the stale "polite live region" sentence at `rich-forms.md:138-140` (contradicts DL #59), add a field-kind → `autocomplete` table, an `aria-invalid` paragraph, and a pointer to the a11y plugin's agent-kit forms guide for generic rules.
8. **Red tests first**, then code. **Verification** = demo videos on a QA testbed copy: validator output, native autofill, `aria-invalid` timing and submit focus, each in **real Chrome and real Safari** (Playwright WebKit alone does not count), accessibility-tree checks, and VoiceOver runs. A browser that cannot be driven = **TODO — needs to be done: blocked until iTerm/Cursor are restarted to pick up Screen Recording/Accessibility/Automation→Safari permissions**.

---

## Background

The Chrome article "Top 10 things AI gets wrong in web dev", point #3 (forms): AI rebuilds `:user-invalid` with JS blur checks, sets `aria-invalid` too early or never syncs it, hides format hints in `placeholder`, puts hints below the field (covered by mobile keyboards / autofill popovers), and forgets `autocomplete`, so autofill and password managers fail.

wix-forms already does the runtime half right: `invalid` flips only for a changed or already-erroring field (DL #53 G2, "late to complain") — the plugin's equivalent of `:user-invalid` — and blur errors are announced once through `statusMessage` (`lib/components/blur-announcer.ts:1-8`). What is missing is the **page** half: nothing checks that a page wires `autocomplete`, `aria-invalid` and `aria-describedby` to the contract.

## Problem

A typical AI-written page:

```html
<label>{contact.email.label}<input ref="contact.email.input" /></label>
<span class="error">{contact.email.error}</span>
```

passes `jay-stack validate` today, but: autofill does not offer the email, VoiceOver never says "invalid", and the error is not read when focus returns to the field. The generic a11y rules cannot tell: the input has no `type`, `name` or `id` for a heuristic, and its error element is always present (DL #59 asks for that), so a "conditional error element" heuristic does not fire.

## Coverage audit — verified against code (corrections)

| Audit claim (the audit) | Verdict | Correction |
|---|---|---|
| Validator `lib/validators/wix-form-bindings.ts` exists | ✅ | Entry `validateWixFormBindings` `:45-75`. |
| "aria-describedby nudge `:154,:449`" | ⚠️ | Those are **suggestion strings only** (`:154` error-in-label, `:449` live error). No check reads `aria-describedby`. |
| "live error element `:448-457`" | ⚠️ | The check is `warnAboutLiveErrorElement` `:436-451`; `liveAttributeOf` starts at `:454`. |
| `blur-announcer.ts:5` role=status announcer | ✅ | Module doc `:1-8`. |
| Guides `rich-forms.md`, `user-visible-messages.md` | ✅ | — |
| "Missing: hint-above-field guidance" | ✅ but | The contract has **no hint/help tag** (`lib/generators/contract-utils.ts:70-98`), and field view data has no description (`lib/utils/read-field-view.ts:11-19`). A contract-based hint rule is impossible today. |
| "Missing: validation for autocomplete and aria-invalid" | ✅ | But the **guide already shows both**: `rich-forms.md:22-24` (example), `:138`, `:419` (one-line `autocomplete` bullet), `:350` (address tokens). |
| (not in audit) | ❌ new | `rich-forms.md:138-140` still says "put the error in a polite live region", contradicting `:399-402` and DL #59. |
| (not in audit) | ❌ new | The contract has **no field kind** (only `elementType`, `contract-utils.ts:22-34`); the kind lives only in the forms reference (`lib/generators/forms-reference.ts:47`). TL;DR 3 adds it. |
| (not in audit) | ❌ new | Existing wix-forms findings carry **no rule id and no suppression key** (`wix-form-bindings.ts:150-184`). This log does not retrofit them (open question 4). |

## Prior Art / Adjacent Mechanisms

| Mechanism | Where | Reuse |
|---|---|---|
| Field a11y walk over `ref="<key>.<field>.input"` | `wix-form-bindings.ts:141-187` | The three rules run inside this walk |
| Error-binding detection `{k.f.error}` / `errorRule` branches | `wix-form-bindings.ts:465-508` | W3 finds the error element with `errorBindingsInSubtree` |
| Address part tags | `lib/validators/address-bindings.ts`, `isAddressContractTag` (`wix-form-bindings.ts:85-87`) | W1 address-part tokens |
| Address token list (guide) | `rich-forms.md:331-350` | W1 table, part of the rule |
| Field kinds | `classifyFormField`, `lib/utils/classify-form-field.ts:117-160` | Source for `meta.kind` |
| Contract generation per field | `fieldTag`, `contract-utils.ts:70-98` | Add the `meta` line |
| Test helper `contextWith` + `CONTACT_TAGS` | `test/wix-form-bindings-validator.test.ts:13-40` | New tests; add nested tags with `meta` |
| Generic rules (jay, public) — **upstream-planned, not yet shipped** | `@jay-framework/a11y-validator`: `placeholder-as-label`, `placeholder-format-hint`, `describedby-missing-id`, `hint-below-field`, `autocomplete-invalid`, `autocomplete-missing`, `password-autocomplete`, `username-autocomplete`, `error-not-associated`, `css-invalid-early`, `css-autofill-color-only` | Not duplicated — see overlap table. Existence is verified in Phase 0 (hard gate) |

The overlap table below assumes those rules ship as designed. **Fallback if any are missing after sync:** work waits for upstream by default; only with explicit product approval may a missing rule's "generic" row become a wix-forms responsibility (scoped to bound fields, its own rule id, recorded in Implementation Results).

### Overlap with the generic rules (who reports what)

| Situation | Generic rule | wix-forms rule |
|---|---|---|
| `autocomplete` misspelled (`phone`) | `autocomplete-invalid` | silent |
| `type="email"` input, no `autocomplete` | `autocomplete-missing` | silent (skip: generic rule sees the type) |
| bound email input, no `type`, no `autocomplete` | silent (no signal) | `field-autocomplete` warning |
| valid but **wrong** token (`autocomplete="name"` on the email field, `address-line1` on `streetName`) | silent (grammar is fine) | `field-autocomplete` **error** |
| `aria-describedby` id that does not exist | `describedby-missing-id` | silent |
| conditional (`if=`) error element not linked | `error-not-associated` | silent (skip conditional elements) |
| always-present `{k.f.error}` element not linked | silent | `field-error-undescribed` |
| always-present wrapper whose children are `if="k.f.errorRule === …"` branches, not linked | silent (wrapper is not conditional) | `field-error-undescribed` (Q6) |
| `aria-invalid` missing / static / bound to another field | silent unless conditional error | `field-invalid-unbound` |
| `:invalid` styling, autofill colour only | `css-invalid-early`, `css-autofill-color-only` | silent |

## Null hypothesis — can we do without new code?

- **Guide only?** The guide already shows `autocomplete` and `aria-invalid` (`rich-forms.md:22-24`) and pages still omit them. A validator that fails loudly wins (validation first).
- **Generic rules only?** They cannot see a bound input's kind or which `{…error}` belongs to which input (overlap table rows 3, 4, 7, 8).
- **Infer kind from the tag name?** `email` could be a text field and `contactMail` an email one; Wix targets are not tag names (`first_name` → `firstName`). Rejected; the contract `meta` is one generated line per field.
- **Read the forms reference file via `projectRoot`?** Works, but couples the validator to a file path and its format. Kept as the fallback if Phase 0 shows `meta` does not reach `headlessImports[].contract` for nested tags.

## Q&A

- **Q1. Why error, not warning, for a wrong token?** The schema says the field is email; `autocomplete="name"` makes the browser fill a name into it. There is no valid reason, and the rule is suppressible.
- **Q2. Why skip "missing" when `type=email|tel`?** The generic `autocomplete-missing` already reports it; one finding per mistake.
- **Q3. Which kinds get a required token?**

  | `meta.kind` / target | Token |
  |---|---|
  | kind `email` | `email` |
  | kind `tel` | `tel` or `tel-national` (both pass) |
  | kind `url` | `url` |
  | target `first_name` | `given-name` |
  | target `last_name` | `family-name` |
  | address `country` / `addressLine` / `addressLine2` / `city` / `subdivision` / `postalCode` | `country` / `address-line1` / `address-line2` / `address-level2` / `address-level1` / `postal-code` |
  | address `streetName`, `streetNumber` | none — `address-line1` here is an **error** |
  | any other kind (`text`, `textarea`, `select`, `checkbox`, `multiselect`) | no check |

  Section/shipping/billing prefixes are allowed: only the field-name token is compared. `autocomplete="off"` satisfies the rule (author's choice), consistent with the generic `autocomplete-missing`.

  Address parts need **no `meta`**: they are recognised from the address contract tags (`isAddressContractTag`), so an old contract still gets the address-part checks and nothing else. W1 walks the whole page, including conditional subtrees (e.g. address inputs under `if="…shown"`); `if=` does not exempt an input from W1 or W2.
- **Q4. Which `aria-invalid` values pass?** `aria-invalid="{k.f.invalid}"` on the input; on checkbox chips `{$parent.k.f.invalid}` on each toggle `<input>` (`rich-forms.md:301,320`). Static `"true"`/`"false"`, or another field's `invalid`, warn. `.control` custom widgets are skipped (guide covers them).
- **Q5. Bound `id` or `aria-describedby`?** Skip the W3 check (cannot know the runtime value), as the generic rules do. Guarded by test 19.
- **Q6. Always-present wrapper around `errorRule` branches?** Pattern (rich-forms §3, `user-visible-messages.md:98-99`):

  ```html
  <p class="error"><span if="contact.email.errorRule === REQUIRED">…</span><span if="contact.email.errorRule === EMAIL">…</span></p>
  ```

  `collectErrorBindings` (`wix-form-bindings.ts:477-487`) already counts these branches as the wrapper's error binding (branches without their own `id`/`ref` are not separate elements). **Decision: the wrapper is the error container and must be linked** — it is always present, so it is exactly the DL #59 element, and linking it gives the input one stable `aria-describedby` target whichever branch shows. Unlinked → warn. Skipping would leave the most common custom-copy pattern unchecked, and the generic `error-not-associated` would only see the conditional branches, which are the wrong link target (they come and go). A branch that has its own `id` is a separate, conditional element and stays with the generic rule (Q5/test 14). Tests 20-21.

## Design

### 1. Contract: `meta` on each visible field (`lib/generators/contract-utils.ts` `fieldTag`)

```yaml
  - tag: email
    type: sub-contract
    phase: fast+interactive
    description: Email
    meta: { kind: email, target: email }
    tags: …
```

Hidden fields (`hiddenFieldTag`) and form-level tags get no `meta`. Fixture `test/fixtures/form-contract-generator/contact.jay-contract` is updated to the correct expected output first (red).

### 2. Rules (inside `detectAccessibilityIssues`, one helper per rule)

Each rule: skip when `ctx.validationOverrides?.['wix-forms']?.['allow-<rule-id>'] === true`; skip when the read attribute holds a `{binding}` (except `aria-invalid`, which must).

- **`field-autocomplete`** — for `ref="<key>.<field>.input"` (and address `<key>.<address>.<part>.input|text`), look up the token (Q3). Missing → warning (unless `type=email|tel`); field-name token ≠ expected → error.
- **`field-invalid-unbound`** — for every bound `.input` / options `.toggle` of a visible field: `aria-invalid` must be exactly `{<key>.<field>.invalid}` (or `{$parent.…}` inside the options `forEach`).
- **`field-error-undescribed`** — for each non-conditional element E whose subtree shows `{<key>.<field>.error}` or holds `errorRule` branches (`errorBindingsInSubtree`, Q6): E needs a static `id`, and the field's input (or chip `<fieldset>`) must list it in `aria-describedby`.

### 3. Message format (exact)

```
[wix-forms/field-autocomplete] ref="contact.email.input" (Wix email field "email") has autocomplete="name"; the browser will fill a name into it.
suggestion: Use autocomplete="email". Suppress with wix-forms: { allow-field-autocomplete: true } in <script type="application/jay-validations">. See: wix-forms rich-forms.md §6.
```

Three variants of `field-invalid-unbound` (same suggestion line for all):

```
[wix-forms/field-invalid-unbound] ref="contact.email.input" has no aria-invalid bound to the field's invalid state, so screen readers never say "invalid".
[wix-forms/field-invalid-unbound] ref="contact.email.input" has a static aria-invalid="true"; it must follow the field's invalid state, so screen readers say "invalid" before the visitor typed anything.
[wix-forms/field-invalid-unbound] ref="contact.email.input" has aria-invalid="{contact.firstName.invalid}", which is another field's state; it must be {contact.email.invalid}.
suggestion: Use aria-invalid="{contact.email.invalid}". Suppress with wix-forms: { allow-field-invalid-unbound: true } in <script type="application/jay-validations">. See: wix-forms rich-forms.md §6.
```

For a static `"false"` the second line reads `aria-invalid="false"; … so screen readers never say "invalid".`

Two variants of `field-error-undescribed`, by whether the element has an id:

```
[wix-forms/field-error-undescribed] <span> showing {contact.email.error} inside ref="contact.email.field" has no id, so ref="contact.email.input" cannot point aria-describedby at it; the error is not read when the field is focused.
suggestion: Give it id="contact-email-error" and add aria-describedby="contact-email-error" to the input. Suppress with wix-forms: { allow-field-error-undescribed: true } in <script type="application/jay-validations">. See: wix-forms rich-forms.md §6.
```

```
[wix-forms/field-error-undescribed] <span id="contact-email-error"> showing {contact.email.error} is not in ref="contact.email.input"'s aria-describedby, so the error is not read when the field is focused.
suggestion: Add "contact-email-error" to the input's aria-describedby. Suppress with wix-forms: { allow-field-error-undescribed: true } in <script type="application/jay-validations">. See: wix-forms rich-forms.md §6.
```

For a Q6 wrapper, "showing {contact.email.error}" reads "showing contact.email.errorRule branches". Without an ancestor `ref`, the "inside ref=…" part is dropped. For chips, "the input" reads "the chip `<fieldset>`".

`plugin.yaml` validator `description` gains the three rule ids.

### 4. Guides (second)

- `rich-forms.md` §3 `:138-140`: replace "polite live region" with "an always-present, non-live element linked by `aria-describedby`" (DL #59).
- `rich-forms.md` §6: replace the one-line `:419` bullet with the Q3 table; add "`aria-invalid` is bound to `invalid`, never set by page code — the plugin already delays it until the visitor changed the field"; add a "Hints" bullet: put format hints and rules **above** the input (or in the label), linked with `aria-describedby`, never only in `placeholder`; one line per rule id with its suppression key; pointer to the a11y plugin's agent-kit forms guide for the generic rules.
- `user-visible-messages.md`: one line — error text is read through `aria-describedby` on focus and through `statusMessage` on blur.

## Implementation Plan

**Phase 0 — gate and spikes (no production code).**

- **Gate (blocking).** `node sync-jay-packages.cjs ../jay`, then `yarn install` (needs the Wix registry network / VPN — on a network error **stop and report**, do not retry). Then confirm each of the eleven rule ids in Prior Art is registered in the synced `@jay-framework/a11y-validator` (e.g. a page that triggers each one under `jay-stack validate`). **Phase 1 does not start until all exist**; if any is missing, apply the Prior Art fallback and record it.

Spikes: (a) A page with a nested field tag carrying `meta`: confirm `meta` reaches `ctx.headlessImports[].contract.tags[].tags` in `jay-stack validate`; if not, use the forms-reference fallback (null hypothesis). (b) Confirm the overrides key is the plugin name `wix-forms`. (c) Confirm where `rich-forms.md` lands in a project after agent-kit generation; the `See:` path in messages and tests is final only after this spike. (d) The upstream `hint-below-field` design exempts error-like describedby targets (text binding, class/id with `error`/`invalid`, `role=alert|status`, `aria-live`, `aria-errormessage` target), so the DL #59 error element should not be flagged. Confirm on the synced build; keep it as guard test 17. (e) Run `jay-stack validate` with the synced CLI and check whether output shows a finding's `element`/`attribute`; if it does, keep the location in the message anyway (harmless) and note it.

**Phase 1 — red tests** (`test/wix-form-bindings-validator.test.ts`, `test/form-contract-generator.test.ts`). Expected outputs are written from this log, not from code runs. Page inputs go in fixture files under `test/fixtures/dl60-field-a11y/` (repo testing standard), as `live-error-subtree/` does; findings are compared with `toEqual` on the full finding list.

| # | Input | Expected |
|---|---|---|
| 1 | contract fixture | each visible field has `meta: { kind, target }`; hidden field none **[red]** |
| 2 | email input, no `autocomplete`, no `type` | 1 warning `[wix-forms/field-autocomplete]` naming `ref="contact.email.input"` and `autocomplete="email"` **[red]** |
| 3 | same with `type="email"` | no wix-forms finding **[guard]** |
| 3b | tel input, no `autocomplete`, `type="tel"` | no wix-forms finding **[guard]** |
| 4 | email input `autocomplete="name"` | 1 **error** **[red]** |
| 5 | `autocomplete="shipping email"` | none **[guard]** |
| 6 | `firstName` (target `first_name`) no token | warning suggesting `given-name` **[red]** |
| 7 | address `streetName` with `address-line1` | error **[red]** |
| 8 | contract without `meta`, text field | none **[guard]** |
| 9 | input without `aria-invalid` | warning `field-invalid-unbound` **[red]** |
| 10 | `aria-invalid="true"` / `{contact.firstName.invalid}` on email | warning each **[red]** |
| 11 | chip toggle with `{$parent.contact.interests.invalid}` | none **[guard]** |
| 12 | always-present `{contact.email.error}` span with no id | warning `field-error-undescribed` **[red]** |
| 13 | span id listed in input's `aria-describedby` | none **[guard]** |
| 14 | error element under `if=` | none (generic rule owns it) **[guard]** |
| 15 | each rule with `allow-<rule-id>: true` override | none **[red]** (suppression is new) |
| 16 | the rich-forms §1 example (`rich-forms.md:15-38`) | zero findings **[guard]** |
| 17 | DL #59 pattern (always-present error span after the input, linked) under the synced a11y plugin | no `hint-below-field` finding **[guard]**. Not a unit test: wix-forms does not depend on the a11y plugin, so it is **not** added as a devDependency. It runs as a testbed-only check folded into V1 (`jay-stack validate` on `/dl60-good`) |
| 18 | tel input with `tel-national` | none **[guard]** |
| 19 | (Q5) unlinked error span, input with bound `aria-describedby="{x}"`; and a second case with the error span's `id="{x}"` bound | none for either **[guard]** |
| 20 | (Q6) always-present `<p>` with only `if="contact.email.errorRule === …"` branches, no id / not linked | 1 warning `field-error-undescribed` naming the wrapper **[red]** |
| 21 | (Q6) same wrapper with `id`, listed in the input's `aria-describedby` | none **[guard]** |
| 22 | (W1) address `city` input inside `if="contact.address.shown"`, no `autocomplete`, contract without `meta` | warning suggesting `address-level2` **[red]** |

**Phase 2 — implement** contract `meta`, the three helpers, `plugin.yaml` description. `yarn build && yarn test` green.

**Phase 3 — guides** (Design §4) + CHANGELOG `## Unreleased`: "regenerate form contracts; new warnings may appear; a wrong `autocomplete` token is now an **error**, which can fail existing `jay-stack validate` / CI runs (suppress with `allow-field-autocomplete`)". No version bump.

**Phase 4 — verification and demos** (below). Update this log's status and the readme row.

## Verification (demo videos for every check, driven like a real user)

Setup: `rsync -a --exclude node_modules <fleet>/testbeds/jay-forms-qa-studio/ <workspace>/qa-testbed/`, point it at `npm pack` tarballs of the synced jay a11y-validator and this wix-forms, `npm install` (Wix VPN; on a network error stop and report). Never edit `testbeds/` itself. Add two pages in the copy: `/dl60-bad` (the Problem markup) and `/dl60-good` (fixed markup). QA data `QA …` / `qa+…@example.com`, submitted as a visitor, deleted afterwards. Videos go to the workspace root, recorded with the demo recorder (`noam-skills/tools/demo-recorder`).

| # | Check | How (real user) | Browsers | Pass |
|---|---|---|---|---|
| V1 | Validator output | `jay-stack validate` on the copy, recorded in terminal; then add `allow-<rule-id>: true` for **one rule at a time** and re-run (three runs) | — | `/dl60-bad`: the three rule ids with located messages and guide; `/dl60-good`: none; each run drops exactly the suppressed rule |
| V2 | Native autofill | Playwright cannot open the browser's own autofill dropdown, so: **Chrome** — real Chrome with a dedicated QA profile holding a saved QA address/contact; **Safari** — real Safari with an AutoFill QA contact card. Both driven by OS-level keyboard (AppleScript keystrokes: Tab into email, Down, Return) and recorded with macOS screen recording | Chrome, Safari | per browser: `/dl60-good` fields hold the QA values (email, given/family name, address parts); `/dl60-bad` does not. A browser that cannot be driven is **TODO — needs to be done: blocked until iTerm/Cursor are restarted to pick up Screen Recording/Accessibility/Automation→Safari permissions**, never pass |
| V3 | `aria-invalid` timing + described-by | Tab through empty form, type bad email, Tab out, Shift+Tab back — on `/dl60-good` and `/dl60-bad` | real Chrome, real Safari | **Chrome**: Playwright on real Chrome, `locator.ariaSnapshot()` (plus `aria-invalid` and resolved describedby text) printed into an on-page overlay after each step, and the DevTools Accessibility pane recorded. **Safari**: real Safari driven by safaridriver or OS keystrokes, the same overlay (page script reads `aria-invalid` / describedby text), macOS screen recording. Playwright WebKit may be an extra run but never replaces Safari. Pass: `/dl60-good` shows `invalid: false` until changed and left, then `true` with the error text as description; `/dl60-bad` shows no invalid state and no description |
| V4 | Error on focus | Return to the invalid field with Shift+Tab | VoiceOver + Safari via `voiceover-check` (`tools/voiceover`, run from iTerm); **plus real Chrome** without a screen reader: DevTools Accessibility pane on the focused input, recorded at the moment focus returns | VoiceOver log has "invalid data" + the error text (describedby) on `/dl60-good`; missing on `/dl60-bad`. Chrome pane shows `invalid: true` and the error text as Description on `/dl60-good`; neither on `/dl60-bad` |
| V5 | Blur announcement unchanged | Leave invalid field | VoiceOver + Safari | error read once after next field's name (DL #59 regression) |
| V6 | Submit | Submit with errors, then fix and submit | real Chrome (Playwright), real Safari (safaridriver or OS keystrokes + macOS screen recording) | per browser: focus to first invalid field, errors announced; success confirmation; QA submission deleted |

No false-green demos: a run that does not show the expected speech or fill is a failure, recorded as such in Implementation Results. **Any browser that cannot be driven for a check (V2, V3, V4, V6) is FAILED / not demonstrated for that check, never pass**, and no substitute browser (e.g. Playwright WebKit for Safari) closes it.

## Trade-offs

- **Contract grows by one line per field**, and pages must regenerate to get the autocomplete rule; old contracts get silence, not noise.
- **Name/first/last mapping is by Wix target**, so a custom "Full name" text field gets no check (no false positives over coverage).
- **Page-wide suppression only**, same as the generic rules.
- **Mixed finding styles until OQ4**: the three new rules carry rule ids and suppression keys, the existing seven wix-forms findings do not. Output looks inconsistent and only new rules can be suppressed; accepted because the retrofit is deferred to a follow-up log.
- **Q6 wrapper must be linked**: pages with custom-copy `errorRule` branches get a new warning; that is the intended push toward one stable describedby target.

## Scope pre-mortem — how could this fail?

| Failure | Mitigation |
|---|---|
| `meta` does not reach the validator for nested tags | Phase 0a; forms-reference fallback |
| Generic rules not shipped when this starts | Phase 0 gate; Prior Art fallback |
| Generic `hint-below-field` flags the recommended error element | Upstream exemption; Phase 0d + guard test 17 |
| Double reports with generic rules | Overlap table + tests 3, 14 |
| Many existing pages light up / CI breaks on the new error | Warnings except wrong token; CHANGELOG states the CI risk and suppression key |
| Native autofill cannot be driven in a browser | Real browser + OS keystrokes + screen recording; otherwise FAILED, not pass |

## Open questions

1. ~~Does `hint-below-field` exempt the always-present error element?~~ **Closed:** the upstream design exempts error-like describedby targets; confirmed in Phase 0d, guarded by test 17.
2. Materialize the Wix field description as a `hint` contract tag (then a `wix-forms/hint-below-field` style rule becomes possible)? Proposed: separate log.
3. ~~`tel` with a country control: require `tel-national`?~~ **Closed** by Q3: both pass (test 18).
4. Retrofit rule ids and suppression keys onto the existing seven wix-forms findings? Proposed: yes, in a follow-up log.

## Agent feedback (jay-feedback decision)

**Both.** Validation: the three rules above. Guide: `rich-forms.md` §3 fix and §6 table, `user-visible-messages.md` line. Generic knowledge stays in the a11y plugin's agent-kit forms guide.

---

## Implementation Results (2026-11-23)

### Phase 0 — gate and spikes

- **Gate: passed.** jay #240 was built from its branch (the first `yarn build` failed in a parallel example build, `scrum-board-with-context`; a re-run passed 71/71). Then `yarn install` and `node sync-jay-packages.cjs <jay root>`. All eleven rule ids are present in the synced `@jay-framework/a11y-validator`.
- **Sync gap (not this log):** the dist-only sync does not bring the a11y plugin's new runtime dependency `postcss-selector-parser` (plus `cssesc`, `util-deprecate`), so `jay-stack validate` failed to load the plugin in every example. For local verification they were symlinked into `node_modules` (untracked, not committed). A released a11y-validator installs them normally.
- **0a:** `meta` reaches `ctx.headlessImports[].contract.tags[]` in a real `jay-stack validate` (QA testbed copy). The forms-reference fallback is not needed.
- **0b:** the overrides key is `wix-forms`; per-page suppression works (V1).
- **0c:** a plugin's `agent-kit/plugin/rich-forms.md` lands in the project at `agent-kit/plugin/rich-forms.md`. The `See: wix-forms rich-forms.md §6.` text is kept.
- **0d:** on `/dl60-good` (always-present, linked error spans after the inputs) the synced a11y plugin reports no `hint-below-field` (test 17 as a testbed check, part of V1).
- **0e:** the CLI prints only message and suggestion, no `element`/`attribute`, so the location stays in the message text.

### What was built

- `lib/generators/contract-utils.ts` `fieldTag`: `meta: { kind: <inputType>, target: <raw Wix target> }` on every visible field. Hidden fields and the shared `addressFieldTag` (also used by wix-bookings) are unchanged; address parts are recognised by `isAddressContractTag`, as designed.
- `lib/validators/field-a11y-rules.ts` (new): the three rules, called from `validateWixFormBindings`. `lib/validators/markup-queries.ts` (new) holds DOM queries moved out of `wix-form-bindings.ts`, so the two modules do not import each other.
- `plugin.yaml` description, `CHANGELOG.md` `## Unreleased` → Breaking item 3 (regenerate contracts, a wrong token is now an error, suppression key). No version change.
- Guides: `rich-forms.md` §3 "polite live region" sentence fixed (now: always-present, non-live element linked by `aria-describedby`, announced via `statusMessage`). §6: the one-line `autocomplete` bullet is replaced by the field-kind table, plus `aria-invalid`, error-linkage, hints-above-field and suppression bullets, and a pointer to the a11y plugin's `forms-and-autofill.md`. `user-visible-messages.md`: one paragraph on how error text is read.

### Reviewer notes folded in

1. **Exact text for a MISSING field-autocomplete token** (warning, `attribute: 'ref'`):
   ```
   [wix-forms/field-autocomplete] ref="contact.email.input" (Wix email field "email") has no autocomplete, so the browser cannot autofill it.
   suggestion: Add autocomplete="email". Suppress with wix-forms: { allow-field-autocomplete: true } in <script type="application/jay-validations">. See: wix-forms rich-forms.md §6.
   ```
   The subject is `Wix <kind> field "<target>"` for email/tel/url, `Wix field "<target>"` for first/last name, and `address part "<part>"` for address parts. For tel the fix reads `Add autocomplete="tel" (or "tel-national").`. A wrong token for a part with no standard token (`streetName`, `streetNumber`) reads `Remove the autocomplete: streetName has no standard token.`.
2. **Four-part address refs and W2/W3: decided — W1 only.** W1 (`field-autocomplete`) covers `<key>.<address>.<part>.input|text` (tests 7, 22). W2/W3 skip address refs: the guide's address pattern binds one field-level error (`{k.address.error}` under `if=`), and per-part `aria-invalid` / describedby timing is not designed here. Per-part linkage is a follow-up candidate alongside open question 4.

### Deviations

- **Wix-suffixed targets.** The real QA form's first-name target is `first_name_5820`: Wix suffixes generated keys with 4 hex digits. An exact `first_name` match would never fire on real sites, so `first_name` / `last_name` also match with an optional `_<4 hex>` suffix. Found at V1; covered by a bug-reproduction test that was red first, and noted in the guide table.
- **W2/W3 scope = fields known from the contract.** A field counts as visible when its sub-contract has an `invalid` channel; address tags are excluded. A context without nested tags (old flat contexts) stays silent, so existing tests and pages without nested tags are unaffected.
- **"Conditional" = the element's own `if=` / `when-*`,** the same test as the generic `error-not-associated`. An `if="!contact.isSubmitted"` around the whole form does not exempt its error elements.
- **Test fixture for test 12:** the DL's sample ancestor `ref="contact.email.field"` is not a contract channel (the existing unknown-channel check errors on it), so the fixture uses a page ref `emailRow`.
- **`autocomplete="on"`** counts as a wrong token (error); only `off` is exempt, as designed.
- **Known overlap:** a bound input with no `type` but an `id`/`name` containing a field word (e.g. `id="email"`) gets both the generic `autocomplete-missing` and `field-autocomplete`. Only `type=email|tel` is skipped, as designed. Accepted; the generic heuristic is upstream.
- **Examples:** no example uses wix-forms and no form contracts are committed, so there was nothing to regenerate. The examples' regenerated `agent-kit/designer/validation-guide.md` (from the synced jay) is not committed.

### Tests

- wix-forms: **918/918** (52 files). New: tests 1-22 from the plan (test 17 as a testbed check), the static-`"false"` variant, the not-listed-id variant, the Problem-page check, the suffixed-target bug test, and 2 contract-utils meta tests. Red before the implementation: 20 failing (the guards 3, 3b, 5, 8, 11, 13, 14, 16, 18, 19, 21 passed as guards).
- Whole repo `yarn test`: 1367/1367. `yarn build`: passed. Examples `npm run validate` (cms, store-light, store, studio-store, whisky-exchange, whisky-store): all exit 0, with warnings only and none from wix-forms (after the sync-gap workaround above).

### Verification (QA testbed copy `qa-testbed-60`, form "QA Contact", tarballs of the synced a11y-validator and this wix-forms)

| # | Result | Video (workspace root) |
|---|---|---|
| V1 | **PASS.** `/dl60-bad`: 1 error + 11 warnings across the three rule ids, located, with the guide named (wrong `autocomplete="name"` on email = error). `/dl60-good`: no findings from any plugin. Each `allow-<rule-id>` run drops exactly that rule (counts 2/5/5 → 0/5/5, 2/0/5, 2/5/0). The video replays the captured real output; a live terminal recording was not possible (screen recording blocked). | `wix-60-validate-20261123.webm` |
| V2 Chrome | **TODO — needs to be done: blocked until iTerm/Cursor are restarted to pick up Screen Recording/Accessibility/Automation→Safari permissions** Native autofill needs OS keystrokes into the browser's own dropdown; Playwright cannot reach that UI and AppleScript is blocked by macOS permissions. | — |
| V2 Safari | **TODO — needs to be done: blocked until iTerm/Cursor are restarted to pick up Screen Recording/Accessibility/Automation→Safari permissions** (Safari, AppleScript and screen recording blocked). No Safari contact or Keychain entry was created. | — |
| V3 Chrome | **PASS** (real Chrome via Playwright; overlay prints DOM `aria-invalid`, resolved describedby, and the CDP AX node). Good: `invalid=false` while empty, untouched and while typing; `true` with description "Please enter a valid email address." after leaving and returning. Bad: never invalid, no description, `autocomplete=name`. | `wix-60-aria-invalid-submit-good-chrome-20261123.webm`, `wix-60-aria-invalid-submit-bad-chrome-20261123.webm` |
| V3 Safari | **TODO — needs to be done: blocked until iTerm/Cursor are restarted to pick up Screen Recording/Accessibility/Automation→Safari permissions** | — |
| V4 Chrome | **PASS, partial substitute:** the CDP accessibility node of the focused input (not the DevTools pane, which cannot be recorded here) shows `invalid: true` + the error as Description on good; neither on bad. Same videos as V3. | (as V3) |
| V4 VoiceOver | **TODO — needs to be done: blocked until iTerm/Cursor are restarted to pick up Screen Recording/Accessibility/Automation→Safari permissions** (VoiceOver/AppleScript blocked). | — |
| V5 VoiceOver | **TODO — needs to be done: blocked until iTerm/Cursor are restarted to pick up Screen Recording/Accessibility/Automation→Safari permissions** (same; the runtime is unchanged by this log). | — |
| V6 Chrome | **PASS.** Empty submit moves focus to the first invalid field (`aria-invalid=true`, described "First name is required."); fixed QA data (`QA DL60 Tester`, `qa+dl60@example.com`) submits, and the confirmation shows with focus on it. The one QA submission was deleted through the Forms API (the follow-up query returns none). | `wix-60-aria-invalid-submit-good-chrome-20261123.webm` |
| V6 Safari | **TODO — needs to be done: blocked until iTerm/Cursor are restarted to pick up Screen Recording/Accessibility/Automation→Safari permissions** | — |

### Agent feedback (done)

Validation: the three rules. Guide: `rich-forms.md` §3 fix and §6 additions, `user-visible-messages.md` line. Generic knowledge stays in the a11y plugin's `forms-and-autofill.md`, which the guide points to.


**Update 2026-11-24 (QA agent): the cells marked TODO are not failures; they are blocked on permissions. Re-attempt:** Accessibility and Automation now work from iTerm (System Events, Safari and VoiceOver AppleScript all answered), but `screencapture` still fails with "could not create image from display" even when run in an iTerm window, so **Screen Recording is still not effective** for iTerm (most likely iTerm must be fully quit and relaunched after the grant, or the grant is on a different app entry). No video could be recorded, so every Safari, VoiceOver and native-autofill cell above stays TODO. No Safari My Card, Keychain entry or QA-site data was created, so nothing needs deleting.

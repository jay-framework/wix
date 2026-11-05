# 44 - Checkbox-Group Multiselect and Native Submit Guard

Status: Design

Builds on **DL#40** (per-form contracts, repeated `options` sub-contract), **DL#41** (value store §0, Capability 4c non-string fields, "Browser re-QA fix (2026-11-02)") and **DL#42** (server-side submit hook). Package: `@jay-framework/wix-forms`. References jay only through its public surface (`@jay-framework/runtime` ref/event types, `@jay-framework/component`).

## Decisions for the Implementer (TL;DR)

- **New contract surface: one per-option interactive ref, `options.toggle`, only on multiselect fields.** Generated as `{ tag: toggle, type: interactive, elementType: HTMLInputElement }` inside the repeated `options` sub-contract (`lib/generators/contract-utils.ts:113-132`). A page binds `<input type="checkbox" ref="contact.interests.options.toggle">` inside `forEach="contact.interests.options"`. `select` fields do not get it (single choice: `input`/`control` suffice).
- **The toggle handler reads the option's value from the jay event's `viewState`, never from the DOM.** jay delivers events on a ref inside `forEach` through a collection proxy whose handler receives `JayEvent { event, viewState, coordinate }` (`@jay-framework/runtime` public types: `JayEvent`, `HTMLElementCollectionProxy`). `viewState` is the option item `{ value, label, selected }`. `event.target.checked` gives the new state.
- **The store keeps `string[]`.** A new pure function `toggleSelection(field, { current, optionValue, checked }): string[]` in `lib/components/submission-values.ts` computes the next array (ordered by option order, de-duplicated). It is unit-tested red-first. `projectSubmissionValues`, `validateFormField` and `form-view-state.ts:54-63` (`selected` per option) need no change — they already treat multiselect as `string[]`.
- **`<select multiple>` keeps working unchanged** through `input` (`readNativeValue`, `wix-form.ts:421-424`). A page uses either `input` on a `<select multiple>` or `options.toggle` on checkboxes for one field, not both (both would still agree: store is last-wins and both are reflected).
- **Reflect back to checkboxes from the store** (reset, member prefill): `reflectToInput` (`wix-form.ts:138-151`) gains a multiselect branch over `refs[field].options.toggle.map((element, option) => { void element.exec$((input) => { input.checked = selected.includes(option.value); }); })` — `element` is an `HTMLNativeExec<…, HTMLInputElement>` (item type per generator naming) and `exec$` returns a promise, hence `void` — that runs **independently of `input?.exec$`** (a chip page has no `input` ref). Pages may also bind `checked="{selected}"`; reflection is the guarantee, the attribute is optional.
- **Submit guard fix: install it from the first DOM event, not from a construction-time `exec$`.** Replace `preventNativeFormSubmit(refs)` (`wix-form.ts:368-372`, called in the `createEffect` at `:181-184`) with `guardOwningForm(event.target, runFormSubmit)`: on the first `focus`, `input`, `keydown` or `click` delivered on any wired field ref or the submit/reset button, take `event.target`, find `closest('form')`, and add one `submit` listener per `<form>` and register **this instance's** routine on it (tracked by a module-scoped `WeakMap<HTMLFormElement, Set<() => Promise<void>>>`); the listener calls `preventDefault()` **and then runs each registered instance's `runFormSubmit()`**. The submit-button click body (`wix-form.ts:238-282`) is extracted into one `runFormSubmit()` routine (the name `submitForm` is taken by the action imported at `:30` and called at `:270`), so a native submit (Enter, `requestSubmit()`) submits through the plugin instead of being swallowed. **Double-submit guard:** `isSubmitting()` (`:240`) is not enough — `setIsSubmitting(true)` runs only at `:265`, after `await seedControlsIntoStore` (`:247`), so two near-simultaneous calls both pass `:240`. The in-flight logic is extracted into a pure exported helper `singleFlight(routine): () => Promise<void>` (sets its flag synchronously before calling `routine`, clears it in `finally`); `runFormSubmit = singleFlight(async () => { if (isSubmitting()) return; …body… })`. `singleFlight` is unit-tested with a deferred stub; `runFormSubmit` itself (a closure in the interactive constructor) is covered only by the browser proof (§4). `event.target` is a bound element by definition, so this does not depend on hydration timing. The mount-time `exec$` attempt is deleted (it is a proven no-op, DL#41 2026-11-02).
- **No new jay surface.** Both items use jay's existing public ref/event API. The "after hydration/bind" hook noted in DL#41 stays a jay follow-up, not a dependency.
- **Closes DL#41 MUST-VERIFY #1** as a Phase-5 verification item: a live submit with a `string[]` interest array and a boolean opt-in through the DL#42 hook path. If Wix rejects native values, apply DL#41's documented fallback (serialize at `create-submission.ts`), still in this log's scope.
- **jay-feedback:** validation (bindings validator: `options.toggle` on a non-multiselect field, a checkbox group bound through `.control` inside `forEach` over `options`, and an unwired form `<button>` without `type="button"`/`"reset"`) + agent-kit guide (`rich-forms.md` §4c checkbox-group example). See §jay-feedback.

## Background

DL#41 4c made checkbox (boolean) and multiselect (`string[]`) first-class in the value store and in the contract: a multiselect exposes a repeated `options` sub-contract `{ value, label, selected }` (`contract-utils.ts:118-130`) and its fields get `input` (`HTMLSelectElement`) and `control` (`HTMLElement`) channels (`contract-utils.ts:85-86`). The agent-kit guide shows only `<select multiple>` (`agent-kit/plugin/rich-forms.md:216-229`).

A consumer form needs an "interests" checkbox-chip group (multi-choice, submitted as an array) plus a boolean opt-in checkbox, submitted through the DL#42 submit hook. Designers draw multi-choice as chips, not a list box.

DL#41's 2026-11-02 re-QA found that `createEffect` in the interactive constructor runs before hydration binds refs (jay's component `mountedSignal` starts `true`), so `exec$` resolves `undefined`. It fixed the hidden-control seed by re-seeding at submit time; the same effect also calls `preventNativeFormSubmit`, which has the same defect and was not fixed.

## Problem

1. **No way to bind a checkbox group to a multiselect.** `input` reads `selectedOptions` (`wix-form.ts:421-424`) — meaningless on a checkbox. `control` reads one `data-value` string and **replaces** the slot (`handleControl`, `wix-form.ts:159-165`; `readControlValue`, `:430-438`), so each chip click overwrites the array with a scalar string. The submitted value is a string, the `selected` variants (`form-view-state.ts:54-63`, `Array.isArray(state.value)`) all go false, and a required-multiselect check sees a non-array.
2. **The `<form>` submit guard is a no-op.** `preventNativeFormSubmit` runs inside the construction-time `createEffect` (`wix-form.ts:181-184`); `refs.submitButton.exec$` resolves `undefined`, so no `submit` listener is added. The button click is protected (`:238-239` `preventDefault`), but a native submit not routed through that click — a form whose submit button is `type="button"` or missing, `form.requestSubmit()`, Enter in a field when the default button is not the wired one — performs a GET navigation and reloads the page with the values in the query string.

## Prior Art / Adjacent Mechanisms

- **`control` channel (DL#41 Cap 4a/5):** one scalar value per field from `data-value`; built for single-choice custom UI (slot grids). Scalar by design.
- **`input` channel:** one native element per field; kind-specific read (`readNativeValue`, `:417-427`).
- **Repeated `options` sub-contract (DL#40 §3):** already the sanctioned array representation; DL#41 MUST-VERIFY #2 confirmed a nested boolean `selected` variant round-trips (DL#41 Implementation Results).
- **jay collection refs (public surface):** a ref declared inside a repeated sub-contract is exposed as `HTMLElementCollectionProxy` — `addEventListener`/`on<event>` handlers get `JayEvent { event, viewState, coordinate }` with the item's view state; `.map((element, viewState, coordinate) => …)` and `.find(predicate)` give per-item `exec$`. This is how jay delivers per-item events in `forEach`.
- **DL#41 2026-11-02 fix:** precedent for "don't trust construction-time `exec$`; do the DOM work when an event proves the element is bound."
- **Bindings validator** (`lib/validators/wix-form-bindings.ts:142-200`): already checks ref first and second segments against the form contract.

## Questions and Answers

- **Q1. Null hypothesis — can `control` do it?** No without changing its meaning. Making `control` toggle for multiselect fields would give one channel two semantics (scalar replace vs. membership toggle) keyed on field kind, and would still read the option from `data-value` (DOM) instead of the item view state. Rejected.
- **Q2. Can `input` do it?** `input` is a single (non-repeated) ref typed `HTMLSelectElement`; binding it inside `forEach` puts a non-collection ref in a collection context and `readNativeValue` would need to guess checkbox-vs-select from the element. Rejected: type and contract lie.
- **Q3. Why a ref inside `options` rather than a new top-level tag?** The option identity lives in the repeated item; jay already hands its view state to the handler. A top-level `toggle` would need `data-value` again.
- **Q4. Name?** `toggle` — states the action (verb-like interactive tag, consistent with `input`/`control` being channels). Alternative `checkbox` encodes the element type; rejected.
- **Q5. Does `selected` reflect without extra code?** Yes: `render` passes `valueByTarget: values()` (`wix-form.ts:333`) and `form-view-state.ts:54-63` recomputes `selected` per option. The DOM `checked` property after a reset is not guaranteed by an attribute binding (same cached-node issue DL#41 hit on reset), hence the explicit reflect.
- **Q6. Is the submit guard still needed given the button click `preventDefault`?** Yes for the paths in Problem #2. Implicit submission via Enter dispatches a click on the form's default button, which is already handled when that button is `refs.submitButton`; every other path reaches the `submit` listener, which cancels navigation **and calls `runFormSubmit()`** — cancelling alone would swallow the submit. A cancelled click fires no `submit` event, so normally only one path runs; when two calls do overlap (click + native submit, or two quick Enters), the second returns at the synchronous `singleFlight` check — `isSubmitting()` alone would not catch it, because it is set only after the first await (`:247` → `:265`).
- **Q7. Can the guard miss a submit?** Yes, two gaps: (a) a programmatic `requestSubmit()` before any event on a wired element — accepted; (b) a user clicking an **unwired** `<button>` (default `type="submit"`) on an untouched or autofilled form — the click lands on an unwired element, so no guard exists yet and the page navigates. (b) is closed by a validator warning (§jay-feedback #3): a `<button>` inside the form without `type="button"`/`type="reset"` that is not `submitButton`/`resetButton`. With that warning heeded, no user-initiated path remains.
- **Q8. Does Wix accept a `string[]` and a boolean in `/forms/v4/submissions`?** Open — DL#41 MUST-VERIFY #1. Verified live in Phase 5; fallback is DL#41's serialize-at-boundary.
- **Q9. Should the validator flag `.control` inside `forEach` over a multiselect's `options`?** Yes — it is exactly the silent-scalar bug in Problem #1 and is detectable from the element tree (warning, suggests `options.toggle`).

## Design

### 1. Contract (`contract-utils.ts` `optionsSubContract`)

For `inputType === 'multiselect'`, after the `selected` variant (`:129`) add:

```yaml
- { tag: toggle, type: interactive, elementType: HTMLInputElement }
```

### 2. Pure seam (`submission-values.ts`)

```ts
/** Next multiselect selection after one option is checked/unchecked, in option order. */
export function toggleSelection(
    field: FormFieldView,
    change: { current: FieldValue; optionValue: string; checked: boolean },
): string[]
```
Rules: start from `current` if array else `[]`; add/remove `optionValue`; return in `field.options` order; ignore values not in `field.options`.

### 3. Wiring (`wix-form.ts`)

- `wireFieldEvents` (`:346-359`): for multiselect fields, `fieldRef.options?.toggle?.onchange(({ event, viewState }) => handlers.onOptionToggle(field, { optionValue: viewState.value, checked: (event.target as HTMLInputElement).checked }))`. `onchange` is in jay's `GlobalJayEvents`, so it is available on the collection proxy.
- `handleOptionToggle`: `dirtyTargets.add`, `setFieldValue(target, toggleSelection(field, { current: values()[target], ...change }))`, `validateField(field)` (a chip change is a commit, like `control`).
- `reflectToInput` multiselect branch: iterate `refs[tag].options?.toggle?.map((element, option) => { void element.exec$(…) })` and set `checked`, as a separate statement **outside** the `input?.exec$` callback (a chip page has no `input`). Reflect also runs from `handleControl` (`:163`) and member prefill, not only reset; for a toggle-origin change the `checked` write equals the element's current state, so it is idempotent and harmless (no skip needed). `map` covers only currently bound items, which is all that is rendered. Reset relies on the existing `clearNativeInputsAfterRemount` microtask (`:214-220`): it calls `reflectToInput` after the form branch re-mounts and the toggle refs re-bind, so the cached checkbox nodes are unchecked.

### 4. Submit guard

```ts
type FormSubmitRoutine = () => Promise<void>;
const submitRoutinesByForm = new WeakMap<HTMLFormElement, Set<FormSubmitRoutine>>();
export function guardOwningForm(target: EventTarget | null, runFormSubmit: FormSubmitRoutine): void {
    const form = (target as HTMLElement | null)?.closest?.('form');
    if (!form) return;
    let routines = submitRoutinesByForm.get(form);
    if (!routines) {
        routines = new Set();
        submitRoutinesByForm.set(form, routines);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            routines!.forEach((routine) => void routine());
        });
    }
    routines.add(runFormSubmit); // Set: idempotent per instance
}
```

`runFormSubmit()` is the extracted submit-button click body (`:240-282`, from the `isSubmitting()` check onward); the button `onclick` becomes `event.preventDefault(); void runFormSubmit();`. The double-submit guard is a pure helper in the same small module as `guardOwningForm`:

```ts
/** Ignore calls while a previous call is still running. Flag is set synchronously, before `routine` runs. */
export function singleFlight(routine: () => Promise<void>): () => Promise<void> {
    let inFlight = false;
    return async () => {
        if (inFlight) return;
        inFlight = true;
        try { await routine(); }
        finally { inFlight = false; }
    };
}
const runFormSubmit = singleFlight(async () => {
    if (isSubmitting()) return;
    /* existing body :241-282 unchanged */
});
```

The `finally` clears the flag on every exit — honeypot return, validation-error return, transport `catch` return, non-redirect result. On a redirect it is also cleared, but `isSubmitting()` stays `true` (`:279`), so the button remains blocked while the page navigates.

**Two `wix-form` instances inside one `<form>`** (supported): the map keys one `submit` listener per form and a `Set` of routines, one per instance, so a native submit runs each instance's own `runFormSubmit()` (each validates and submits its own fields). A per-form `WeakSet` would have run only the first instance's submit. **Accepted asymmetry:** when the form's default button is instance A's wired `submitButton`, Enter dispatches a click on it; A's handler calls `preventDefault()`, so no `submit` event fires and **only A submits**. `requestSubmit()` or Enter with an unwired default button fires `submit` and runs **all** registered instances. We do not make A's click run every routine: a wired button belongs to its instance.

**Lifecycle.** `submitRoutinesByForm` is module-scoped. Reset re-shows the same cached `<form>` node (`:200-213`), so the form stays in the map and its listener and routine set stay — idempotent, no second listener. A remount that creates a **new** `<form>` node: the old listener is garbage with the old node; the new node is not in the map, so the next event on a wired element guards it. **Unmount while the `<form>` survives:** the instance releases its routine via jay's `createEffect` cleanup (public `@jay-framework/component` API: the returned cleanup runs when the component unmounts). A dedicated effect with no reactive reads: `createEffect(() => () => releaseFormGuard(guardedForm, runFormSubmit))`, where `guardedForm` is the instance's form recorded by `guardOwningForm` and `releaseFormGuard` deletes the routine from that form's `Set` (the listener stays; an empty `Set` is a no-op).

**Where the trigger is registered.** `onfocus` and `onkeydown` are added on every `input`, every `control`, and every `options.toggle` collection ref (a chip-only page focuses only toggles), plus the call inside each existing handler.
Called first in every field handler (`handleNativeInput`, `handleControl`, `handleOptionToggle`), in the new `onfocus`/`onkeydown` registrations above (Enter can be pressed without an `input` event), and in the submit/reset button handlers. `preventNativeFormSubmit` and its call in the `createEffect` are deleted; the effect keeps only the seed call. It is kept because it is **harmless** (seeding never overrides edited or stored values) — not because it is claimed to work on client navigation, which is unverified; the submit-time seed is the guarantee.

## Implementation Plan

Each phase writes its tests red first and ends green.

1. **Phase 1 — pure function.** `toggleSelection` tests (add, remove, order, unknown value, non-array current) in `test/submission-values.test.ts`, red → implement → green.
2. **Phase 2 — contract.** Generator fixture expecting `options.toggle` on multiselect only (expected file written by hand), red → `contract-utils.ts` → green. Check the generated `*.jay-contract.d.ts` has exactly the nested path `refs.<field>.options.toggle: HTMLElementCollectionProxy<…, HTMLInputElement>`, with the item type named as the generator already names repeated items (e.g. `OptionOfWixFormViewState`, `lib/contracts/wix-form.jay-contract.d.ts:28`).
3. **Phase 3 — validator.** Tests for the three findings in §jay-feedback, red → `wix-form-bindings.ts` → green.
4. **Phase 4 — component wiring + guard.** `wix-form.ts` §3/§4, incl. `runFormSubmit = singleFlight(…)` extraction and the unmount release. `guardOwningForm`, `releaseFormGuard` and `singleFlight` are exported from a small pure module; unit tests with a minimal fake element (`closest`, `addEventListener` stubs) cover: idempotence for one routine, one listener for two routines on one form and both called on `submit`, `preventDefault` called, release removes only that routine. `singleFlight` tests with a deferred stub: (a) two back-to-back calls (no await between) → one routine call; (b) after the deferred resolves, and separately after it rejects, the next call runs the routine again. `runFormSubmit` itself is not unit-tested (constructor closure; covered by browser item (c)). Rewrite the comments that describe the deleted mount-time guard: `wix-form.ts:176-180` (the effect now only seeds; say why the seed is kept), `:222-225` (the `<form>` guard is installed lazily from the first event, `guardOwningForm`) and `:265` (`// synchronous: before the first await (double-submit guard)` — the guard is now `singleFlight`; `setIsSubmitting` only drives UI state).
5. **Phase 5 — agent-kit + browser proof (`/demo-feature`).** Example page in the package's example app: interests chip group, opt-in checkbox, required email, submit hook. Verify per §Verification. Close DL#41 MUST-VERIFY #1 and record it in both logs' Implementation Results.

## Examples

✅ Checkbox-chip group
```html
<label forEach="contact.interests.options" trackBy="value" class="chip {selected ? 'on' : ''}">
  <input type="checkbox" ref="contact.interests.options.toggle" value="{value}" /> {label}
</label>
<label><input type="checkbox" ref="contact.optIn.input" /> Keep me posted</label>
```
✅ `<select multiple ref="contact.interests.input">` with `<option forEach=… selected="{selected}">` (unchanged).

❌ `<input type="checkbox" forEach="contact.interests.options" ref="contact.interests.control" data-value="{value}">` — submits the last clicked value as a string (validator warning).
❌ `ref="contact.country.options.toggle"` on a single `select` — no such tag (validator error).

## Trade-offs

- **+1 contract tag per multiselect** vs. overloading `control`: explicit, typed, and reads the item from jay view state. Cost: one more tag for agents to learn (covered by guide + validator).
- **Lazy guard** vs. a jay "after bind" hook: works today with no upstream change; misses only a pre-interaction programmatic submit (Q7). Adopt the jay hook when it exists and delete the lazy path.
- **Explicit reflect** duplicates what `checked="{selected}"` may do; kept because reset reuses cached nodes.

## Verification Criteria

- Unit: `toggleSelection`, generator fixture + `.d.ts` type, validator findings, `guardOwningForm` idempotence / per-instance routines / release, `singleFlight` back-to-back → one routine call and re-runs after resolve/reject — all green after being red.
- Browser (`/demo-feature`, video at workspace root): (a) clicking chips toggles `selected` styling and the submit payload holds `interests: ["a","c"]` in option order; (b) opt-in submits `true`/`false`; (c) on a page whose default button is **not** the wired `submitButton`, from a **fresh load with no prior focus or click**: press Tab into the email field, type, press Enter — no navigation (URL unchanged, no query string) and the plugin submit runs (payload sent) or validation errors show. This verifies the ordering: the `focus`/`keydown` handler installs the guard **before** the browser's implicit submission fires `submit`. Then `form.requestSubmit()` after focusing a field behaves the same; two rapid Enters produce exactly one submit request; (d) reset unchecks all chips; (e) `<select multiple>` page still submits an array.
- **Live Wix (closes DL#41 MUST-VERIFY #1):** submission through the DL#42 hook returns `success: true` and the Wix dashboard shows the interests array and opt-in boolean. Else apply the boundary-serialization fallback and re-verify.
- `yarn test` / `npm run build` in `packages/wix-forms`; example `npm run validate` clean.

## Scope Pre-mortem

- *The generated refs type does not type `options.toggle` as an `HTMLInputElement` collection* → caught by the Phase 2 `.d.ts` check.
- *Chips styled with a hidden input don't fire `change` or can't take focus* → the guide must recommend **visually-hidden clipping** (e.g. `clip`/`1px` sr-only pattern), **not `display:none`** — a `display:none` input cannot be focused (breaks keyboard use and the focus-triggered guard). A wrapping `<label>` forwards clicks.
- *Wix rejects arrays* → DL#41 fallback, same log.
- *Guard still misses a path* → browser item (c) catches it; accepted gap: programmatic submit before any interaction (Q7a).
- Out of scope: single-choice radio group (served by `control`), min/max selection counts.

## jay-feedback

Priority validation → agent-kit → framework:
- **Validation (yes):** in `wix-form-bindings.ts` (`detectUnknownRefFieldTags`, `:142-200`). Today it destructures only `[key, firstSegment, secondSegment]` and `subTagsByField` holds one level. Changes:
  - **Collect nested tags recursively:** build `subTagsByField` as a tree — for each field tag, for each sub-tag with `tags`, record its children (`options` → `{value, label, selected, toggle}`). Destructure `[key, first, second, third]`.
  - (1) **error:** `ref="<key>.<field>.options.<third>"` where `<third>` is not in the `options` children (e.g. `toggle` on a single `select`). **Gate iv:** if the context lacks nested tags for that field (`options` has no `tags`), skip silently, as the existing second-segment check does.
  - (2) **warning:** `ref="<key>.<field>.control"` on an element whose own `forEach` or an ancestor's `forEach` equals `<key>.<field>.options` (check the element itself first — ref and `forEach` on the same element is the ❌ example — then walk `parentNode` upward). Mechanism: `walkElements` (`@jay-framework/compiler-shared`) visits `node-html-parser` `HTMLElement`s (it reads `rawTagName`/`getAttribute`), and `node-html-parser`'s `Node` declares `parentNode: HTMLElement`, so the ancestor walk uses `el.parentNode` until `null`; no stack is threaded through the visitor. Rule (3) uses the same walk to find the owning `<form>`. Suggests `options.toggle`. Applies only when the field's `options` children include `toggle` (i.e. multiselect).
  - (3) **warning:** a `<button>` inside a form-bound subtree without `type="button"` or `type="reset"` whose ref is not `<key>.submitButton`/`<key>.resetButton` — clicking it natively submits an untouched form (Q7b). Suggests `type="button"`. **Form-bound subtree:** a `<button>` that descends from a `<form>` element which contains (anywhere in its subtree) at least one `ref` starting with a per-form import key `<key>.`. Tests: button outside any `<form>` → no warning; button in a `<form>` with no `<key>.` ref → no warning; explicit `type="submit"` unwired → warns; no `type` unwired → warns; `type="button"` → no warning; wired `ref="<key>.submitButton"` (any type) → no warning; unwired `type="reset"` → no warning.
- **Agent-kit (yes):** `rich-forms.md` §4c — add the checkbox-chip example, state "multi-choice checkboxes bind `options.toggle`; `control` is single-value", and note the submit guard needs no page code.
- **Framework (no):** recorded follow-up only — a supported after-bind hook in jay would let the guard and the hidden-control seed run once at mount.

---

## Pre-implementation notes (from review round 4 + architect review)

Folded in before Phase 1; none changes the design.

1. **Guarded form record.** `guardOwningForm(target, routine): HTMLFormElement | undefined`; the instance keeps a mutable `let guardedForm: HTMLFormElement | undefined`, set from the first guard call (never captured as `undefined` by the cleanup closure). `export function releaseFormGuard(form: HTMLFormElement | undefined, routine: FormSubmitRoutine): void`; release with `undefined` is a no-op (test).
2. **Batching.** The native `submit` listener is a raw `addEventListener`, so `runFormSubmit()` runs outside jay's handler batching. Accepted — signal updates still apply; Phase 5 item (c) covers behaviour.
3. **Implicit-submission path.** With no submit button, browsers implicitly submit only single-field forms. Verification (c) uses a page with an **unwired default `<button>`** (or a single-field form), not "no button".
4. **Validator rule (3) scope.** `<button form="…">` (explicit owner) is out of scope and skipped; test case added.
5. **First-load prefill.** Member prefill can run before toggles bind, so explicit reflect may no-op on first load; the chip example in `rich-forms.md` uses `checked="{selected}"` so first render is correct. Verified in the browser.
6. **Verification (c) precondition.** "Two rapid Enters → exactly one submit request" runs with a valid form (valid email filled).
7. **Enter-vs-guard ordering is the highest risk.** If Phase 5 (c) (fresh load → Tab → type → Enter → URL unchanged) fails, treat it as a design bug and revise this log — not flaky QA.
8. **Honeypot.** A bot that only fills the honeypot does not install the guard; accepted, same class as Q7a.
9. **Validator copy.** Once `toggle` exists, unknown `options.*` ref errors suggest `.toggle` alongside `.control`/`.input`.
10. **DL #41 cross-reference.** On ship, append one line to DL #41 Implementation Results: the mount-time `preventNativeFormSubmit` was ineffective for the same hydration reason; superseded by DL #44.
11. **Done gate.** Done = unit tests green **and** browser item (c) **and** live MUST-VERIFY #1 (or the documented serialize-at-boundary fallback applied).

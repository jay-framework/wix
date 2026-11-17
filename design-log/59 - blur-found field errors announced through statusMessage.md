# 59 - Blur-Found Field Errors Announced through statusMessage

Status: [Implemented] — VoiceOver re-listen passed 2026-11-17 (macOS Safari + VoiceOver; NVDA, JAWS and TalkBack untested, a recorded gap).

Numbering: renumbered from #58 (taken by another branch's log). Whichever branch merges to `main` second rebases its `readme.md` row.

Builds on **DL #53** (G2 "late to complain, early to forgive": blur validates only a dirty or already-erroring field, typing never re-checks into an error; G1 page checks), **DL #41** Addendum A (accessible form pattern, the `role="status"` region, the bindings validator's accessibility warnings) and **DL #57** (current shape of `submit()` / `resetForm()`). Paths are relative to `packages/wix-forms/` unless stated. Line numbers are for branch `forms-blur-announce` at `79683ad`. jay is referenced only by its public surface. No consumer site is named.

## Decisions for the Implementer (TL;DR)

- **One new small module, `lib/components/blur-announcer.ts`**, exporting `createBlurAnnouncer({ setStatusMessage, delayMs })` and `BLUR_ANNOUNCE_DELAY_MS = 0` (Phase 0 result: clear now, write on the next macrotask via `setTimeout(…, 0)` — never a synchronous write). It owns one timer and one "who owns `statusMessage` right now" slot. API: `announce(target, text)`, `withdraw(target)`, `cancel()`. No other file calls `setTimeout` for this. (Round 3: the `whileMuted` mute of earlier revisions is dropped — the existing gates already cover every plugin focus move; see Q11.)
- **Phase 0 passed (2026-11-17, VoiceOver + Safari; NVDA not tested) — decision table row 8.** A human listen on a static spike page found that clearing the `role="status"` region and writing the error one task later (`setTimeout(…, 0)`) is read after the next field's name, at every delay tried (0 / 150 / 500 / 1000 ms, no difference heard). So the clear-then-deferred-write is what fixes the bug, not a timing value: `BLUR_ANNOUNCE_DELAY_MS = 0`. **Per-field `aria-live` is removed** (redundant: no gain, more speech). NVDA, JAWS and TalkBack are untested — a known gap. See Implementation Plan → Phase 0 results.
- **`announce`**: cancel any pending timer, `setStatusMessage('')` now, then in a `setTimeout(…, delayMs)` callback (next macrotask at the shipped `0`) `setStatusMessage(text)` and record `owner = target`. Clearing first is what makes the same text re-read on a second invalid leave.
- **Only a visitor's native blur, outside a submit and while the form is shown, announces** (`handleNativeBlur`, `lib/components/wix-form.ts:212`). One gate, two existing signals: `!isSubmitting() && !isSubmitted()`. `isSubmitting` (`:114`) is set at `:427` via `setBusy` (`:138-141`); `isSubmitted` (`:120`) is written only by `showSubmitted()` (`:344`) and `resetForm()` (`:333`). Typing (`handleNativeInput`, `:217`), `control` commits (`:226`) and chip toggles (`:235`) never announce. DL #53 G2 is intact: blur still validates only a dirty or erroring field.
- **Fixing clears silently**: whenever a field's error clears — on blur, on a `control` commit or chip toggle (`validateField` finds no message), or while typing (`clearFieldError` at `:178` via `:221`) — `withdraw(target)` cancels a pending announcement for that field and, if `statusMessage` holds that field's announcement, sets it to `''`. `withdraw` for a field that does not own the announcement is a no-op (it never clears another field's or a submit's message).
- **Submit and reset win, by an invariant**: `cancel()` runs immediately before the existing `setStatusMessage('')` in `submit()` (`:413`) and `resetForm()` (`:331`). From `:413` to `:427` the code is synchronous (no blur can interleave); from `:427` the busy gate blocks announcements for the whole await window (`:432`, `:441`, `:443`, `runFormSubmit` `:460`) and through every outcome handler (busy is cleared only after them: `setBusy(false)` in `finally` `:476-478`, and `form-submit-execution.ts:49` after `presentSubmitResult` at `:45`).
- **One rule for every confirmation (honeypot and real success)**: `showSubmitted()` (`:342`) calls `blurAnnouncer.cancel()` before `setIsSubmitted(true)`, and the `isSubmitted()` half of the gate blocks every blur until `resetForm()`. This covers the honeypot returns (`:420-423`, `:435`, which never hold busy at the confirmation) and the success path where the visitor typed an invalid value during the flight (busy clears at `form-submit-execution.ts:49`, then the form branch's removal blur re-validates the current value). No new flag; `showHoneypotSuccess` (`:482-485`) is unchanged.
- **Pages that word their own errors are announced in their own wording (product decision), in its own later phase (Phase 5)**: it is independent of the announcer: it only changes which text is the field's `error`, so it ships and is useful (localised submit-time and rejection errors) even if the announcer is reverted. `registerFieldChecks` gains an optional third argument, `{ messages }` — per field target, per failed `FieldRule`, the page's text. When the plugin produces a built-in-rule error for that field and rule (blur, submit-time client check, or a Wix format rejection), that text **is** the field's `error`; the announcer announces `error`, so visible `{error}` and the announcement are one text. No entry → the plugin's default text, as today. Rules that already carry page or hook text (`CUSTOM`, `HOOK`) are never reworded. See Design → "Page wording".
- **Teardown and bfcache**: `cancel()` on `pagehide` (next to the existing `pageshow` listener `:405-409`) and from a `createEffect` cleanup (jay `@jay-framework/component` public `createEffect(effect: () => void | EffectCleanup)`; add `createEffect` to the import at `:24`).
- **Unchanged**: per-field `error` (for every page that registers no `messages`), `invalid`, `errorRule`, focus-to-first-invalid on submit, `aria-describedby` linkage, the contract (no new tag — `statusMessage` already exists).
- **Behaviour change for pages (CHANGELOG + guide)**: `statusMessage` is no longer always empty outside a submit; after a rejection, a later invalid blur replaces the rejection's status text. A page that renders `{k.statusMessage}` visibly now shows the blur error twice (field + status line); a page that binds it inside a `submitFailure === REJECTED` branch now shows blur errors there. The guide changes to: bind `statusMessage` only to the always-present `role="status"` region (visually hidden or visible), write static copy in failure branches, and **remove `aria-live` from per-field error elements** (Phase 0). The CHANGELOG carries an upgrade checklist of these page edits (Phase 3). The change affects every site at runtime with no opt-out; the release owner picks the version (this log picks none).
- **Agent feedback (jay-feedback decision): both.** Guide updates in `agent-kit/plugin/rich-forms.md` §3 / §6 and the page-checks section, `per-form-contracts.md`, `user-visible-messages.md` (`:28`, `:51`, `:64-67`) and `agent-kit/designer/wix-forms-dashboard-content.md:75`. **Plus a validation warning** in `lib/validators/wix-form-bindings.ts` `detectAccessibilityIssues`: an element whose own text binds `{key.field.error}` and is live → warning "error is announced twice". **No validator** for drift between a page's `errorRule` branches and its registered `messages` (Q13).
- **Tests first, fake timers.** Reproduction tests are red before implementation (tests 1–23 are written in Phase 1; page-wording tests 24–30 in Phase 5). **[red]**: 1, 2, 11, 18, 24, 26, 27, 29, 30, plus the setup assertions of 4, 5, 7, 13, 15, 22, 23 and 28. **[guard]**: 3, 6, 8, 9, 10, 12, 14, 16, 17, 19, 20, 21, 25, and the remaining assertions of 4, 5, 7, 13, 15, 22, 23 and 28. For tests 1–23, "red" means red on today's code; for tests 24–30, "red" means red at the start of Phase 5 (after the announcer has shipped). See Implementation Plan, phases 1 and 5. Timer-driven cases use `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(0)` (precedent `test/submittable-forms.test.ts:19,113`).

---

## Background

- `statusMessage` is a component signal (`lib/components/wix-form.ts:115`), rendered through `buildFormViewState` (`:552`; type `lib/components/form-view-state.ts:36`). It is a `fast+interactive` data tag in every generated form contract (`lib/generators/contract-utils.ts:149`).
- Today it is written only by submit and reset: cleared at `submit()` start (`:413`) and in `resetForm()` (`:331`); set to `SUBMIT_FAILED_MESSAGE` on a thrown submit (`:471`) and to `rejection.statusMessage` on a server rejection (`:513`). `presentSubmitRejection` builds it from `statusLines` — the server message plus `label: message` for hidden/unknown targets (`lib/components/submit-outcome.ts:77-92`).
- Blur-time checks: `wireFieldEvents` binds `input.onblur` → `handleNativeBlur` (`:582`). `handleNativeBlur` (`:212-214`) calls `validateField` (`:171-176`) only if the field is dirty or already shows an error. `validateField` writes `errorByTarget` / `invalidByTarget` / `ruleByTarget` from `checkField` (`:160-169`): built-in rules first (`checkFormField`), then — only if they pass — the page's checks (`runPageChecks`, `lib/components/page-checks.ts:27`).
- Typing: `handleNativeInput` (`:217-224`) marks dirty, stores the value, and clears a shown error once the field passes — never sets a new one. `handleControl` (`:226-232`) and `handleOptionToggle` (`:235-242`) call `validateField` on commit.
- Submit-time client errors: `showClientErrors` (`:487-504`) → `showFieldErrors` (`:350-352`) moves focus to the first invalid input; the error is read through `aria-describedby`. This works. jay's public `exec$` invokes its handler synchronously, so that focus move happens while busy is still set (pinned by test 16).
- Page wording today: `FieldRule` (`lib/components/field-rule.ts:9-25`) is exposed as `errorRule`; `FieldCheckResult.message` is "its default (English) message" (`:27-31`). `rich-forms.md:145-155` tells pages wanting their own wording or language to branch on `errorRule` in jay-html. Page checks (`registerFieldChecks`, `lib/contexts/wix-forms-context.ts:72`, `:133-146`) already return the page's own text, shown as `CUSTOM`.
- The guides prescribe `aria-live="polite"` on each per-field error element (`agent-kit/plugin/rich-forms.md:27`, `:149`, `:278`, `:344`; `agent-kit/plugin/per-form-contracts.md:81`) and an always-present `<p role="status" aria-live="polite">{k.statusMessage}</p>` (`rich-forms.md:37`, `:348`). `user-visible-messages.md:51` binds `{contact.statusMessage}` inside the `submitFailure === REJECTED` branch of a `role="alert"` paragraph; `:64-67` shows a visible `if="contact.statusMessage"` paragraph and states `statusMessage` "is empty … on a client-validation failure"; `:28` says hidden-field rejection errors are in `statusMessage`.
- The bindings validator (`plugin.yaml:22-25`, `lib/validators/wix-form-bindings.ts`) already warns on error text inside a `<label>` (`:118-129`) and has a helper that lists an element's own error bindings (`ownErrorBindings`, `:400`).

## Problem

A human VoiceOver listen (macOS Safari) on a consumer site found: when a visitor leaves a field invalid, the error appears in the per-field `aria-live="polite"` element at the same moment focus moves to the next field. VoiceOver announces the newly focused field and drops the polite update; the visitor hears nothing until they return to the field (then `aria-describedby` reads it). Submit-time errors and the submit `statusMessage` are announced correctly.

**Assumption tested in Phase 0 (now resolved).** The design assumed a polite update to an always-present `role="status"` region, written some time after focus moves, is queued after the newly focused field's name. Phase 0 found that no wait is needed: clearing the region and writing the text one task later (`setTimeout(…, 0)`) is read after the field's name, and 150 / 500 / 1000 ms sounded the same. The observed bug was a different write: a per-field `aria-live` update in the same moment as the focus move. What is proven necessary and sufficient is the clear-then-deferred-write into the status region, not a timing value.

Approved behaviour (product decision; not reopened here):

1. On a blur-found error, the plugin writes that field's error text into `statusMessage`: clear first, set on the next macrotask (`BLUR_ANNOUNCE_DELAY_MS = 0`, from Phase 0), so it is read after the next field's name; re-announced on each invalid leave.
2. Fixing the field clears that announcement and says nothing.
3. Typing never announces.
4. Submit-time `statusMessage` is unchanged and wins over a pending blur announcement.
5. Per-field error text and `aria-describedby` unchanged.
6. Consumers remove `aria-live` from per-field error elements. Phase 0 confirmed it (per-field `aria-live` redundant: no gain, more speech); no product re-confirmation is needed, because removal is the approved behaviour.
7. (Round 3) When a page words its own field errors (by branching on `errorRule`), VoiceOver reads the page's wording, not the plugin's default text. With no page wording, the plugin's default text is announced.

## Prior Art / Adjacent Mechanisms

- **The existing status region** is the only element the guides already require to be always present and live — reusing it needs no new contract tag.
- **`afterRemount`** (`wix-form.ts:261`, doc comment `:255-260`) is the plugin's existing "defer past the reactive flush" helper. The announcer defers the same way (`setTimeout(…, 0)`), but does not reuse it: the announcer also needs a cancellable handle and an owner slot (withdraw on fix, cancel on submit / reset / unmount / `pagehide`), which `afterRemount` does not offer.
- **`createSubmitFlight`** (`lib/components/form-submit-flight.ts`) is the existing pattern for "a later event invalidates an earlier pending one"; the announcer follows the same small-factory shape.
- **`withTimeout` in `lib/services/submittable-forms.ts:83-93`** is a one-shot timeout raced against a promise, cleared in `finally` — not a debounce. It is cited only as the house style for owning a `setTimeout` handle and always clearing it.
- **The `pageshow` bfcache listener (`wix-form.ts:405-409`)** is the precedent for page-lifecycle handling in the component; the `pagehide` cancel sits beside it.
- **`registerFieldChecks`** (`wix-forms-context.ts:133-146`) is the existing public channel from page code to the form's validation, already keyed by form id and field target, with unregister and call-time lookup (`page-checks.ts:4-5`). The page-wording map rides on it.
- **No external precedent is cited.** The clear-then-deferred-refill technique is a known practitioner workaround for re-reading identical text; this log cites no source that proves it survives a focus change, so it was measured in Phase 0 (it does, on VoiceOver + Safari). The GOV.UK Design System's error-message guidance advises validating on submit rather than on blur; this plugin already validates on blur (DL #53 G2, approved), so that guidance is context, not support.

## Null hypothesis — can we do this without new code?

- _Guide-only: tell consumers to use `role="alert"` on errors._ Rejected — assertive interrupts the focused field's name; DL #41 Addendum A already chose polite on purpose (`rich-forms.md:344`).
- _Consumer-side script that copies the field error into the status region._ Rejected — every consumer would reimplement the timer, the clear-first trick and the submit-wins rule; it belongs to the owner of `statusMessage`.
- _A new contract tag (`announcement`)._ Rejected — `statusMessage` already has exactly this meaning and consumers already bind it.
- _Write synchronously (no deferral)._ Rejected — a write in the same moment as the focus move is the bug's own condition (the observed failure was exactly that, from the per-field live region). Phase 0 proved only the clear-now, write-one-task-later sequence; a synchronous clear-and-write may also coalesce, so the identical text would not be re-read. Deferral costs nothing here, since cancel and withdraw are needed anyway.
- _Mute the plugin's own focus moves_ (earlier revisions). Rejected in round 3 — the busy gate and the `isSubmitted` gate already cover every plugin focus move (Q11).
- _A new suppress flag for the confirmation_ (round 2). Rejected — `isSubmitted` already means "the confirmation is shown, until reset".
- **Page wording (behaviour 7)**:
  - _Page checks alone._ Not enough: page checks run only after the built-in rules pass (`wix-form.ts:166-168`), so a page cannot reword `REQUIRED` / `EMAIL` / … through them.
  - _A new contract tag or a jay-html attribute naming the announcement text._ Rejected — contract regeneration for every form, and the text would live in a second place beside the `errorRule` branches.
  - _Read the visible error element's text at announce time._ Rejected — the error element has no `ref` (the validator relies on that, `wix-form-bindings.ts:130-131`), so the plugin cannot reach it without a new ref convention, and the branch the page shows depends on a not-yet-flushed render.
  - _A new context method (`setFieldMessages`)._ Rejected — a second registration lifecycle for the same form id and targets.
  - **Chosen: an optional third argument to the existing `registerFieldChecks`.** Same key (form id), same targets, same unregister, same call-time lookup, same once-per-target unknown-target warning. Backward compatible (existing two-argument calls unchanged). The page states its wording once in TypeScript, and the plugin uses it as the field's `error`, so the visible `{error}` and the announcement cannot differ.

So: one small module plus a handful of call sites (blur, clear, control/chip fix, submit/reset start, `showSubmitted`, lifecycle), and one optional argument on an existing public method.

## Q&A

1. **Q: Why does `withdraw` check ownership instead of always clearing?** A: `statusMessage` is shared with submit. After a server rejection, typing into a field must not erase the rejection text. Ownership (`owner === target`) is reset by `cancel()` on every submit/reset, so a submit message is never owned by a field.
2. **Q: Field A is left invalid, then field B is left invalid before A's deferred write runs. What is announced?** A: B only. `announce(B)` cancels A's pending timer. With a 0 ms deferral this window is one task, so in practice it needs a programmatic double blur; the rule still holds. A's error remains reachable via `aria-describedby`. Trade-off accepted (rapid tabbing).
3. **Q: A's announcement is showing; the visitor leaves B _valid_. Does A's text stay in `statusMessage`?** A: Yes. Withdraw is per-owner. The region is silent until changed; the stale text is only visible on a page that renders it visibly (see Trade-offs).
4. **Q: Does a still-invalid field re-announce on every leave, even unchanged?** A: Yes (approved behaviour 1). G2 still gates validation: an untouched field is never validated, so never announced.
5. **Q: Should `control` commits and chip toggles announce?** A: No, out of scope — focus stays on the control, so there is no focus-move race. But they **do withdraw**: if a commit fixes a field whose blur error is announced (a field with both `input` and `control`), `handleControl` (`:226-232`) / `handleOptionToggle` (`:235-242`) call `withdraw(field.target)` when `validateField` finds no message, so a fixed field never leaves its announcement behind (approved behaviour 2). Test 23.
6. **Q: What if the component is torn down, or the page enters bfcache, while a timer is pending?** A: Both cancel. The component registers one `createEffect` whose cleanup calls `blurAnnouncer.cancel()` (public behaviour: a `createEffect` cleanup runs when the component unmounts; pinned by test 19). A `pagehide` listener (beside `pageshow`, `wix-form.ts:405-409`) also calls `cancel()`. If phase 1 shows the effect cleanup does not run on unmount in this runtime, the `pagehide` cancel stays and a dead-component setter write is accepted as harmless (no DOM) — record it in Implementation Results.
7. **Q: What delay?** A: `0`, meaning clear now and write on the next macrotask (`setTimeout(…, 0)`), never synchronously. Phase 0 heard no difference between 0, 150, 500 and 1000 ms on VoiceOver + Safari, so no wait was added. The round-4 rule "0 ms passes → stop, the bug is not the timing" was written assuming 0 ms meant a same-moment write; the spike's 0 ms still clears first and defers the write by one task, and the observed bug was a same-moment per-field `aria-live` update, so a 0 ms pass confirms the design rather than refuting it (recorded as a Phase 0 result). The constant stays named so a later re-listen on another reader can raise it without code changes. The post-implementation re-listen (Verification) re-checks it in the real plugin.
8. **Q: Does the announcement text include the field label?** A: No — it is the field's error text. Built-in messages already name the problem; the guide recommends page wording and custom messages that stand alone ("Enter your email", not "Required").
9. **Q: Does the honeypot or page-check path change?** A: Honeypot: no visible change; both honeypot returns reach `showSubmitted()`, which now cancels and flips the `isSubmitted` gate (one rule with real success). Page checks: their errors found on blur go through `validateField` like built-in ones, so they are announced too, in the page's text (as today, `CUSTOM`).
10. **Q: Why gate on `isSubmitting()` instead of cancelling in each outcome?** A: The await window (`:432`, `:441`, `:443`, `:460`) is after the `:413` clear, and two outcomes (client-validation stop `:452-455` → `:487-504`, success / redirect `:528`) never write `statusMessage`. The gate makes the rule hold for every path by construction. Blur still validates during the flight (unchanged); it just does not announce.
11. **Q: Do the plugin's own `focus()` calls need a mute?** A: No — every one is already gated. `focus()` synchronously blurs the visitor's current input, so each call site was traced:
    - `showFieldErrors` `:351` on a client-validation stop: `showClientErrors` runs at `:453`, busy since `:427`, cleared only by `setBusy(false)` in `finally` `:476-478` after it returns; jay's public `exec$` invokes its handler synchronously, so the focus runs inside it. Busy gate.
    - `showFieldErrors` `:351` via `presentSubmitResult` `:515` on a rejection: `runFormSubmit` calls `presentSubmitResult` at `form-submit-execution.ts:45` and clears busy at `:49`, after it. Busy gate.
    - Reset focus `:338`: `resetForm` has cleared `dirtyTargets` and `errorByTarget` (`:327-335`), so `handleNativeBlur` returns before validating.
    - Confirmation focus `:346`: after `showSubmitted()`, so the `isSubmitted` gate.

    Under the null-hypothesis rule the mute is dropped. Residual risk (pre-mortem): if jay ever deferred `exec$` (a sandboxed runtime mode), the `:351` focus could land after busy clears; test 16 would catch that in the mode it runs in.

12. **Q: After a server rejection, a later invalid blur replaces the rejection's status text. Is that acceptable?** A: Yes, accepted (behaviour 1 says the blur error is written into `statusMessage`, and only one text fits). The rejection text was already read when it arrived. Hidden-field errors that live only in `statusMessage` (`user-visible-messages.md:28`) are not fixable by the visitor; the next submit reports them again. A page that must keep a hook's message on screen renders its own copy from `onSubmitOutcome` (`event.code`, `event.fieldErrors`, `wix-forms-context.ts:47-58`) or static copy in its `REJECTED` branch — the guide says so and stops binding `statusMessage` inside failure branches (`user-visible-messages.md:51`).
13. **Q: Can a page's `errorRule` branches and its registered `messages` drift apart, and can a validator catch it?** A: They can drift only on a page that keeps literal text in `errorRule` branches _and_ registers `messages` with different text; the guide's pattern removes the branches (bind `{error}`, word it once in `messages`), so there is one source. **No validator**: the wording is registered in TypeScript at runtime, which no jay-html validator sees (the same reason the page-check key and target warnings are runtime console warnings, `wix-forms-context.ts:148-156`, `page-checks.ts:35-38`). A jay-html rule that flags every literal `errorRule` branch would also fire on pages that register nothing — a false warning, against the house rule "a missed warning, never a false one" (`wix-form-bindings.ts:309`, `:345`). Decision recorded; the guide is the guard.
14. **Q: Which rules can a page reword, and where?** A: Every rule except `NONE`, `CUSTOM` (already page text) and `HOOK` (the hook's own text). Applied wherever the plugin produces that error: `checkField` (blur, typing's pass check, submit-time client validation) and the per-field errors of a server rejection (format rules and `SERVER`; `rich-forms.md:158-160` — "the rule is the same whoever caught it"). Hidden fields are out of scope (they have no visible error; the existing unknown-target warning covers a hidden target). The first registration, in registration order, that has text for that target and rule wins — the same order as checks ("the first message wins", `wix-forms-context.ts:39`).

## Design

### `lib/components/blur-announcer.ts` (new)

```ts
/** Deferral of the status write after the clear. 0 = the next macrotask, never synchronous: the
 *  clear-then-deferred-write is what VoiceOver reads after the next field's name (DL #59, Phase 0). */
export const BLUR_ANNOUNCE_DELAY_MS = 0;

export interface BlurAnnouncer {
  announce(target: string, text: string): void;
  withdraw(target: string): void;
  cancel(): void;
}

export function createBlurAnnouncer(options: {
  setStatusMessage: (text: string) => void;
  delayMs?: number;
}): BlurAnnouncer;
```

State: `pendingTimer`, `pendingTarget`, `owner` (target whose text is in `statusMessage`, or none).

- `announce(target, text)`: `clearTimeout(pendingTimer)`; `setStatusMessage('')`; `owner = none`; `pendingTarget = target`; `pendingTimer = setTimeout(() => { setStatusMessage(text); owner = target; pendingTarget = none }, delayMs)`.
- `withdraw(target)`: if `pendingTarget === target` → clear timer; if `owner === target` → `setStatusMessage('')`, `owner = none`. Otherwise no-op.
- With `delayMs = 0` the write is still one task later, so the timer, `withdraw` and `cancel` are all still needed: a fix, submit, reset, unmount or `pagehide` can land in between.
- `cancel()`: clear timer, `pendingTarget = owner = none`. Does not write `statusMessage`. **Contract: every caller either writes `statusMessage` itself right after** (`submit()` `:413`, `resetForm()` `:331`), **or runs where `statusMessage` holds no blur text** (`showSubmitted()`: every path to it starts at `:413` and is gated since), **or is a teardown** (`pagehide`, effect cleanup). No other caller exists.

### Call sites in `lib/components/wix-form.ts`

- Construct after the signals (`:115-133`): `const blurAnnouncer = createBlurAnnouncer({ setStatusMessage })`; `createEffect(() => () => blurAnnouncer.cancel())` right after (import at `:24`).
- `validateField` (`:171-176`) stays a `void` command; callers read `errorByTarget()[field.target]` after it (signal reads after a setter are synchronous).
- `handleNativeBlur` (`:212-214`):
  ```ts
  if (!(dirtyTargets.has(field.target) || errorByTarget()[field.target])) return;
  validateField(field);
  const message = errorByTarget()[field.target];
  if (!message) blurAnnouncer.withdraw(field.target);
  else if (!isSubmitting() && !isSubmitted()) blurAnnouncer.announce(field.target, message);
  ```
- `handleControl` (`:226-232`) and `handleOptionToggle` (`:235-242`): after `validateField(field)`, `if (!errorByTarget()[field.target]) blurAnnouncer.withdraw(field.target);`. Never announce.
- `clearFieldError` (`:178-182`): add `blurAnnouncer.withdraw(field.target)` (covers typing-to-fix, `:221`).
- `resetForm` (`:325`) and `submit` (`:411`): `blurAnnouncer.cancel()` immediately before the existing `setStatusMessage('')` (`:331`, `:413`). No `cancel()` at `:471` / `:513`.
- `showSubmitted` (`:342`): `blurAnnouncer.cancel()` as its first line, before `setIsSubmitted(true)` (`:344`). Nothing else; `showHoneypotSuccess` (`:482-485`) is unchanged.
- `focusFirstFieldInput` (`:606-616`) and the confirmation focus (`:346`): unchanged (Q11).
- Lifecycle: `window.addEventListener('pagehide', () => blurAnnouncer.cancel())` inside the existing `typeof window` guard (`:405`).

### Page wording (`registerFieldChecks` third argument)

Public surface, `lib/contexts/wix-forms-context.ts` (exported next to `FieldCheck` / `FieldChecks` from `lib/index.ts:17-18` and `lib/index.client.ts:16-17`):

```ts
/** Field target → the page's own wording per failed rule; used as the field's `error` (DL #59). */
export type FieldMessages = Record<string, Partial<Record<FieldRule, string>>>;

export interface FieldCheckOptions {
    /** Not for CUSTOM (a check's own text) or HOOK (the hook's text); those are never reworded. */
    messages?: FieldMessages;
}

registerFieldChecks(formId: string, checks: FieldChecks, options?: FieldCheckOptions): () => void;
```

- Context state (`:133-146`): one record per registration (below); unregister removes it. The component's read side gains an internal `registeredFieldMessages(context, formId): FieldMessages[]` beside `registeredFieldChecks` (`:106-109`), behind a symbol key like `REGISTERED_CHECKS` (`:93-99`). `FieldRule` is imported type-only from `../components/field-rule.js` (client-safe).
- Registration record: the context stores each registration as one `FieldRegistration = { checks: FieldChecks; messages: FieldMessages }` record (`messages` defaults to `{}`) in `registrationsByFormId` (today `Map<string, FieldChecks[]>`, `wix-forms-context.ts:130`, appended at `:139`). Unregister filters by the **record's** identity (today `registered !== checks`, `:141-144`), so two registrations that share one `checks` object never collide. `registeredFieldChecks` / `registeredFieldMessages` both map over the same records.
- `lib/components/page-checks.ts` is the factory `createPageCheckRunner(formId, fields)` (`:27`). Its return shape changes: today it returns a `PageCheckRunner` function (`page-checks.ts:18-21`); it now returns `{ runPageChecks: PageCheckRunner, pageWordingFor: (field: FormFieldView, rule: FieldRule) => string | undefined }` (an exported `PageCheckRunners` type), with `runPageChecks` unchanged in behaviour. Call sites: `wix-form.ts:131` becomes `const { runPageChecks, pageWordingFor } = createPageCheckRunner(carryForward.formId, carryForward.fields);`, and `:167` (`runPageChecks(field, submittedValueOf(field, value), allValues)`) keeps its text, now calling the destructured function. `pageWordingFor` shares `formId` and the visible targets (`:28-30`) — call-time context lookup (as `:72-75`), first registration with text for `field.target` + `rule` wins, `undefined` for `NONE` / `CUSTOM` / `HOOK`. The unknown-target scan (`warnAboutUnknownTargets`, `:39-49`) takes the records: `registrationsScanned` (`:32`, today a `WeakSet<FieldChecks>`) becomes a `WeakSet<FieldRegistration>` keyed on the record, and each unscanned record contributes the keys of both `checks` and `messages`.
- `wix-form.ts` `checkField` (`:160-169`): when the built-in result fails, return `{ rule, message: pageWordingFor(field, rule) ?? builtIn.message }`. This one change covers blur, typing's pass check and submit-time client validation (`showClientErrors` takes `checkField` results, `:446-450`).
- `presentSubmitResult` rejection branch (`:507-517`): before `setErrorByTarget(rejection.errorByTarget)`, replace each visible target's text with `pageWordingFor(field, rejection.ruleByTarget[target])` when defined. `presentSubmitRejection` (`submit-outcome.ts`) and the `statusMessage` lines (hidden fields) are unchanged.
- The announcer is untouched: it announces `errorByTarget()[target]`, which is now the page's text when given; the default text when not.

### Submit outcome paths (every path, after the change)

| Path                   | Where                                                              | `statusMessage`           | Why no blur text can remain                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start                  | `:413`                                                             | `''`                      | `cancel()` right before                                                                                                                                                                                                             |
| Honeypot (sync)        | `:420-423` → `showHoneypotSuccess` `:482` → `showSubmitted` `:342` | `''`                      | nothing can announce between `:413` and `:342` (synchronous); from `:344` the `isSubmitted` gate blocks the removal blur                                                                                                            |
| Honeypot (DOM)         | `:432-436` → `:482`                                                | `''`                      | busy gate until `showSubmitted`; `isSubmitted` gate after (busy is then cleared by `setBusy(false)` in `finally` `:476-478`)                                                                                                        |
| Stale generation       | `:433`                                                             | reset's                   | busy since `:427`; reset ran `cancel()`                                                                                                                                                                                             |
| Client-validation stop | `:452-455` → `:487-504`                                            | `''`                      | busy gate, including the `:351` focus blur (busy cleared at `:478` after return)                                                                                                                                                    |
| Network failure        | `:471`                                                             | `SUBMIT_FAILED_MESSAGE`   | busy gate                                                                                                                                                                                                                           |
| Server rejection       | `:513`                                                             | `rejection.statusMessage` | busy gate, including the `:515` → `:351` focus blur (busy cleared at `form-submit-execution.ts:49`)                                                                                                                                 |
| Success                | `:528` → `showSubmitted` `:342`                                    | `''`                      | busy gate during the flight; `cancel()` + `isSubmitted` gate from `showSubmitted` until reset — covers the removal blur even when the visitor typed an invalid value during the flight (test 21), and the confirmation focus `:346` |
| Redirect               | `:528` (navigates, stays busy)                                     | `''`                      | busy gate                                                                                                                                                                                                                           |
| Reset                  | `:331`                                                             | `''`                      | `cancel()` right before; `isSubmitted` false again at `:333`                                                                                                                                                                        |

### Validator warning (`lib/validators/wix-form-bindings.ts`)

In `detectAccessibilityIssues` (`:113`), for each non-label element — **placed after the `<label>` branch (`:118-129`) and before `const ref = …; if (!ref) return;` (`:130-131`)**, because error elements carry no `ref`: if `ownErrorBindings(el, formKeys)` (`:400`) is non-empty and the element's **own** attributes make it live — `aria-live` with any value other than `off`, or `role` of `alert`, `status` or `log` — push:

- severity `warning`, attribute `aria-live` (or `role`)
- message: `"{key.f.error}" is on a live element (aria-live / role), so a blur error is announced twice — wix-forms already announces it through statusMessage.`
- suggestion: `Remove aria-live from the error element; keep it linked from the input with aria-describedby, and bind {key.statusMessage} to an always-present role="status" region.`

Scope: own text only (not ancestors) — a missed warning, never a false one (`:309`, `:345`). Update the `plugin.yaml` validator description. In scope: Phase 0 removed per-field `aria-live`.

## Implementation Plan

**Phase 0 — human screen-reader spike (before any code; gate for every later phase). Done 2026-11-17 — passed, row 8; results below.** A static spike page, kept outside the package, with results recorded in this section. The page has no build and no plugin code. It has a small form (E-mail with a simple invalid rule, Phone, Name), per-field error text linked with `aria-describedby`, an always-present visually hidden `role="status"` region, a delay selector (0 / 150 / 500 / 1000 ms), and a toggle for per-field `aria-live="polite"` on the error spans. On an invalid blur the script clears the status region, then writes the error after the chosen delay; fixing the field clears the region silently.

Listening protocol, per screen reader and per delay (the spike's "0 ms" clears the region now and writes the text in `setTimeout(…, 0)`, one task later):

1. Tab into E-mail, type an invalid value, Tab to Phone. Repeat 3 times per delay.
2. Re-enter E-mail, leave it unchanged and invalid, Tab out (re-announcement of the same text).
3. Fix E-mail, Tab out (must be silent).

Screen readers: macOS VoiceOver + Safari (required); NVDA + Firefox or Chrome on Windows (if a Windows machine is available; otherwise recorded as "not tested").

Pass criteria for one delay on one screen reader: in **3 of 3** runs of step 1 the next field's name is heard first and then the **full** error text, once, not cut off; step 2 re-reads it; step 3 says nothing extra. (As designed before the listen, 0 ms was the control and a 0 ms pass meant "back to design". That rule is superseded by the Phase 0 results below: the spike's 0 ms is a deferred write, not the same-moment write that caused the bug.)

Decisions taken from the results — **the Phase 0 decision table**. This table is the only source for the go/stop decision, the delay, the switch (per-field `aria-live` removes / keeps), the gaps to record and product re-confirmation of behaviour 6; every other mention of the switch points here. Exactly one row applies.

Definitions:

- **VoiceOver passes / NVDA passes**: at least one delay ≤ 1000 ms meets the pass criteria on that reader. **Fails**: no delay ≤ 1000 ms does.
- **Per-field `aria-live` redundant (double reading or no gain)**: judged at the chosen delay, with the per-field `aria-live` toggle on, the error is read from the field span and again from the status region, or the toggle adds nothing heard over the status region.
- **Delay**: "VO min" is the smallest VoiceOver-passing delay; "max(VO min, NVDA min)" takes the higher of the two smallest passing delays (both ≤ 1000 ms by definition).
- **Switch removes**: the guide advice, the validator warning, test 18 and the Phase 3 `aria-live` edits all stay. **Switch keeps**: the guides keep per-field `aria-live`, and the validator warning, test 18, the validator-test pattern edit, the chip pair edit, the `plugin.yaml` description update and CHANGELOG checklist item 4 are dropped.
- JAWS and TalkBack are untested in every row (Trade-offs). Every gap below goes in the results table and in the CHANGELOG as a known gap.

| #               | VoiceOver         | NVDA       | Per-field `aria-live` redundant (double reading or no gain) | Outcome                                     | `BLUR_ANNOUNCE_DELAY_MS` | Switch  | Gaps recorded                                                                                  | Product re-confirms behaviour 6 |
| --------------- | ----------------- | ---------- | ----------------------------------------------------------- | ------------------------------------------- | ------------------------ | ------- | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| 1               | fails every delay | any        | any                                                         | **Stop** — Phase 1 does not start; redesign | none                     | not set | the full results table                                                                         | no (design reopens)             |
| 2               | passes            | passes     | yes on VoiceOver                                            | proceed                                     | max(VO min, NVDA min)    | removes | none                                                                                           | no                              |
| 3               | passes            | passes     | yes on NVDA only                                            | proceed                                     | max(VO min, NVDA min)    | removes | none                                                                                           | no                              |
| 4               | passes            | passes     | no                                                          | proceed                                     | max(VO min, NVDA min)    | keeps   | none                                                                                           | yes                             |
| 5               | passes            | fails      | yes on VoiceOver                                            | proceed — **VoiceOver double reading wins** | VO min                   | removes | NVDA does not read blur errors at all (no status read-out, no per-field live region)           | yes                             |
| 6               | passes            | fails      | yes on NVDA only                                            | proceed                                     | VO min                   | keeps   | NVDA status read-out cut off or mistimed; where it is heard, it repeats the field's live error | yes                             |
| 7               | passes            | fails      | no                                                          | proceed                                     | VO min                   | keeps   | NVDA misses the status read-out (keeps today's per-field reading)                              | yes                             |
| **8 (applied)** | passes            | not tested | yes on VoiceOver                                            | proceed                                     | VO min                   | removes | NVDA untested, including the `aria-live` choice                                                | no                              |
| 9               | passes            | not tested | no                                                          | proceed                                     | VO min                   | keeps   | NVDA untested, including the `aria-live` choice                                                | yes                             |

"Yes on NVDA only" cannot occur when NVDA is not tested, so rows 8–9 cover that case. **Resolved precondition (round-8 finding 1):** the earlier rule "a 0 ms pass on VoiceOver is a stop" no longer applies. A 0 ms pass (clear now, write one task later) passes as any other delay and maps to rows 2–9 like it; exactly one row applies.

**Stop and redesign (row 1).** Return to design, considering: (a) announce on the next field's `focus` event instead of a timer (append the error to the status region when the new field has been focused and read); (b) keep per-field `aria-live` and rely on `aria-describedby` read-out when the visitor returns, documenting the limitation; (c) an assertive (`role="alert"`) announcement only for blur errors, weighed against interrupting the field name.

**Phase 0 results** (2026-11-17; one human tester on macOS Safari + VoiceOver; NVDA not tested):

| Screen reader + browser | 0 ms       | 150 ms     | 500 ms     | 1000 ms    | Per-field `aria-live` redundant (double reading or no gain)? |
| ----------------------- | ---------- | ---------- | ---------- | ---------- | ------------------------------------------------------------ |
| VoiceOver + Safari      | pass       | pass       | pass       | pass       | yes — read once, but with much more speech; no gain          |
| NVDA + Firefox / Chrome | not tested | not tested | not tested | not tested | not tested                                                   |

- **Step 1** (type `ann@` in E-mail, Tab): at every delay, VoiceOver reads the next field ("Phone…") first, then the e-mail error. Judged good enough by the tester. No difference heard between 0, 150, 500 and 1000 ms.
- **Step 2** (leave again without fixing): the error is read again. Judged good enough.
- **Per-field `aria-live` toggle on**: the error is read once, but with much more spoken content — redundant and more verbose, no gain over the status region alone.
- **The 0 ms case, resolved**: the spike's 0 ms clears the status now and writes in `setTimeout(…, 0)`. It passing shows that the fix is the clear-then-deferred-write into the status region, not a wait. The observed bug was a per-field `aria-live` update in the same moment as the focus move, which the spike does not do at any delay. So `BLUR_ANNOUNCE_DELAY_MS = 0` (next macrotask, not synchronous); 150 ms is dropped.

Decision table row: **8** · Chosen `BLUR_ANNOUNCE_DELAY_MS`: **0** (clear now, write on the next macrotask) · Switch: **removes** · Gaps recorded: **NVDA, JAWS and TalkBack untested, including the `aria-live` choice** (also in the CHANGELOG upgrade notes) · Product re-confirmation of behaviour 6: **not needed** (removal matches the approved behaviour) · Phase 1 may start: **yes**, after approval of this log.

In the test descriptions below, "advance" means `await vi.advanceTimersByTimeAsync(BLUR_ANNOUNCE_DELAY_MS)` (that is, `0`); "not yet" is the value asserted synchronously right after the triggering event, before advancing.

**Phase 1 — announcer tests first; starts only after Phase 0 passes** (ends with exactly the listed **[red]** cases red, for the right reason, and every **[guard]** green). New `test/blur-announcer.test.ts` (unit, `vi.useFakeTimers()`), new cases in `test/wix-form-validation-timing.interactive.test.ts` (harness `mountWixForm`), validator cases in `test/wix-form-bindings-validator.test.ts`.

_Timers under the harness:_ the existing cases flush with `settle()` (a real 10 ms `setTimeout`, `test/wix-form-validation-timing.interactive.test.ts:39-41`), which waits out jay's `setTimeout(0)` auto-batch that `afterRemount` relies on (`wix-form.ts:255-263`). The new cases call `vi.useFakeTimers()` **before** `mountWixForm` and replace every `settle()` with `await vi.advanceTimersByTimeAsync(0)` for a flush and `await vi.advanceTimersByTimeAsync(BLUR_ANNOUNCE_DELAY_MS)` (that is, `0`) to run the deferred write (drains the submit awaits' microtasks too, as in `test/submission/run-submission.test.ts:417-426`). `vi.useRealTimers()` and `vi.unstubAllGlobals()` in `afterEach`. Each timing case asserts the "not yet" value synchronously before advancing (the write is one task late even at `0`).

_Window under the harness:_ the interactive tests run in `// @vitest-environment node` (`wix-form-validation-timing.interactive.test.ts:1`), so the `typeof window` guard (`wix-form.ts:405`) skips listener registration. Test 17 calls `vi.stubGlobal('window', { addEventListener, removeEventListener: vi.fn(), location: { assign: vi.fn() } })` with a capturing `addEventListener` **before** `mountWixForm`, then invokes the captured `pagehide` listener (precedent `test/wix-form-submit-outcome.interactive.test.ts:150-160`). Without the stub test 17 is vacuous, so it first asserts that a `pagehide` listener was captured.

Labels: **[red]** fails on today's code (reproduction); **[guard]** already passes today because `statusMessage` stays `''` outside submit (only `:331`, `:413`, `:471`, `:513` write it) — a lock-in test for the new mechanism, not counted as a reproduction. A case whose red part is one assertion says which.

1. **[red]** _should announce a blur-found error in statusMessage on the next macrotask_ — dirty required email, blur empty → `''` synchronously, the field's error after advance.
2. **[red]** _should clear statusMessage before re-announcing the same error on a second invalid leave_ — second blur → `''` synchronously, then the same text after advance (observe both writes).
3. **[guard]** _should not announce while typing_ — type into an erroring field to another invalid value → `statusMessage` unchanged.
4. **[guard] (red part: the setup assertion)** _should silently clear the field's announcement when the field is fixed by typing_ — dirty field, blur invalid, advance → **assert `statusMessage` equals its error** (red today); type valid → `''`, and no later write after advancing timers.
5. **[guard] (red part: the setup assertion)** _should silently clear when the field is left valid on blur_ — dirty field, blur invalid, advance → **assert `statusMessage` equals its error** (red today); type a valid value, blur → `''`, and no later write after advancing timers.
6. **[guard]** _should cancel a pending announcement when the field is fixed before the delay_.
7. **[guard] (red part: the setup assertion)** _should not clear another owner's message on withdraw_ — sequence: (1) field A dirty, blur invalid, advance → **assert `statusMessage` equals A's error** (red today); (2) type A valid → `''`; (3) submit; `submitForm` resolves a rejection with a message and a field error for B → `statusMessage` equals the rejection text; (4) type B valid (its error clears, `withdraw(B)`) and type into A → **rejection text kept**, also after advancing.
8. **[guard]** _should let submit win over a pending blur announcement_ — blur invalid, submit before advancing, advance → submit's value (`''` for a client-validation stop), never the blur text.
9. **[guard]** _should cancel a pending announcement on reset_.
10. **[guard]** _should not announce a blur on an untouched field_ (G2 regression guard).
11. **[red]** _should announce only the last of two rapid invalid leaves_.
12. **[guard]** _should not announce on control commit or chip toggle_.
13. **[guard] (red part: the setup assertion)** _should not leave a blur announcement behind on a client-validation stop_ — blur A invalid, advance, **assert `statusMessage` equals A's error**; submit with a field invalid → `''` after the submit settles and after a further advance.
14. **[guard]** _should not announce a blur that happens during an in-flight submit_ — valid form, `submitForm` held on a deferred promise; during the flight blur a dirty field into an invalid value, advance → never the blur text; resolve success → `''`.
15. **[guard] (red part: the setup assertion)** _should not leave a blur announcement next to the success confirmation_ — blur a dirty field invalid, advance, **assert its error text**; fix the field, submit, success → `''`; dispatch the input's `blur` (removal blur), advance → `''`.
16. **[guard]** _should not announce the blur caused by the plugin's focus move after an Enter-key submit_ — field **A precedes B in `fields`**; B's invalidity comes from a page check `checkB = vi.fn(() => 'Pick a later date')` registered for B, so its call count proves B was validated. Wire the harness so the plugin's focus on A really blurs B: `inputA.focus.mockImplementation(() => listenerFor(inputB, 'blur')({}))` (`test/support/wix-form-harness.ts:69`, `:109-115`). Setup: type into B (dirty), leave A empty and required. Submit; after the submit settles **assert `inputA.focus` was called and `checkB` gained exactly two calls during the submit** (one from submit validation, one from the focus-dispatched blur — so the blur handler ran and validated, independent of `showClientErrors`); advance → `statusMessage === ''`. Variant for a server rejection (`:515`): same wiring, `submitForm` rejects A → `statusMessage` stays the rejection text after advance. Passes today (nothing announces); after the change it proves the busy gate covers the focus blur without a mute.
17. **[guard]** _should cancel a pending announcement on pagehide_ — stubbed `window` (above); blur invalid, invoke the captured `pagehide` listener, advance → `''`.
18. **[red]** Validator: warns on `<span aria-live="polite">{k.f.error}</span>`, `role="alert"`, `role="status"`, `role="log"`; **no** warning on `aria-live="off"`, without any live attribute, on an ancestor live region, or on the `statusMessage` region.
19. **[guard]** _should cancel a pending announcement when the component unmounts_ — blur invalid, unmount before advancing, advance → no `setStatusMessage(text)` write. The harness (`test/support/wix-form-harness.ts:323-328`) drops the instance returned by `component({})`; it gains `unmount: () => instance.unmount()` on `WixFormHarness`.
20. **[guard]** _should not announce the removal blur after a honeypot fake success_ — dirty invalid field focused, honeypot filled, submit, dispatch the field's `blur`, advance → `''`.
21. **[guard]** _should not announce an invalid edit typed during a successful submit when the form is removed_ — valid form, `submitForm` held on a deferred promise; during the flight type an invalid value into a dirty field (focus stays); resolve success, flush → confirmation shown, `statusMessage === ''`; dispatch the field's `blur` (removal blur), advance → still `''`. Also assert the field's `invalid` became true (the blur re-validated, so the gate — not a skipped validation — kept it silent).
22. **[guard] (red part: the setup assertion)** _should keep another field's announcement when a different field is left valid_ — A dirty, blur invalid, advance → **assert `statusMessage` equals A's error** (red today); B dirty, left valid on blur, advance → still A's error; type A valid → `''`.
23. **[guard] (red part: the setup assertion)** _should withdraw a field's announcement when a control commit fixes it_ — field with `input` and `control`: blur invalid, advance, **assert the announcement**; commit a valid value through `control` → `statusMessage === ''`, and no later write. Same for a chip toggle.
    The page-wording tests 24–30 are written in Phase 5, not here (page-wording cases in `test/wix-form-page-checks.interactive.test.ts` and `test/contexts/wix-forms-context.test.ts`):

24. **[red]** _should use the page's registered wording as the field error and announce it_ — `registerFieldChecks(formId, {}, { messages: { email: { [FieldRule.REQUIRED]: 'Indiquez votre e-mail.' } } })`; dirty email, blur empty → `error === 'Indiquez votre e-mail.'`, `errorRule === REQUIRED`, and `statusMessage` equals that text after advance.
25. **[guard]** _should fall back to the plugin's default text for a rule the page did not word_ — same map, email `"x"` (EMAIL fails) → `error` is the default EMAIL text, and `statusMessage` equals that default text after advance (both green when written: the announcer shipped in Phases 2–4).
26. **[red]** _should use the page's wording for submit-time client errors_ — map for REQUIRED, submit with the field empty → `error` is the page text.
27. **[red]** _should use the page's wording for a Wix format rejection_ — map for EMAIL and SERVER; `submitForm` rejects the field with rule EMAIL / SERVER → `error` is the page text; a `HOOK` rejection and a page check's `CUSTOM` text are never reworded even if the map has entries for those rules.
28. **[guard] (red part: the setup assertion)** _should stop using the wording after unregister_ — register with a map, blur empty → **assert page text**; unregister, blur again → default text.
29. **[red]** _should use the first registration's wording for the same field and rule_ — two registrations with different REQUIRED text → the first one's text.
30. **[red]** _should warn once about a messages target that is not a visible field_ — mirrors the existing checks warning (`page-checks.ts:39-49`).

Existing page-check and context tests (two-argument `registerFieldChecks`) must stay green unchanged.

**Phase 2 — implement the announcer and its call sites** (ends with tests 1–23 green except test 18). `blur-announcer.ts` (`BLUR_ANNOUNCE_DELAY_MS = 0`) and the `wix-form.ts` call sites. `yarn test` → every Phase 1 test (1–23) green except 18 (the validator rule is not written yet; no existing test changes).

**Phase 3 — `statusMessage` guide edits, CHANGELOG, and the validator rule with the fixture and existing-test edits it forces, in one step** (ends all green; Phase 0 removed per-field `aria-live`, so every bullet below is in). The rule makes an existing expectation wrong, so it changes in the same phase:

- `test/wix-form-bindings-validator.test.ts:183-195` _should accept the accessible pattern_ — its pattern carries `<span id="email-error" aria-live="polite">{contact.email.error}</span>` (`:190`) and expects `[]`. Update the **pattern** to the new accessible one (drop `aria-live`, add a `role="status"` region bound to `{contact.statusMessage}`); the expectation `[]` stays.
- `rich-forms.md:278` and `test/fixtures/checkbox-chips/chip-group.jay-html.fragment:12` — the verbatim test (`test/rich-forms-chip-example.test.ts:79-90`, `expect(guide).toContain(chipGroup.trim())`) pins them together, so drop `aria-live` from both in the same commit. (That test runs jay compiler validations, not the bindings validator — `:31-53` — so the new warning itself does not break it; the guide edit does.)
- `test/fixtures/old-contract/page.jay-html:12` has an `aria-live` error, but `test/old-contract-compat.test.ts:115-120` checks only jay compiler validations and the render (`:128`), not the bindings validator — unaffected. It stays as-is: it models an old page.
- Guides: remove `aria-live` from the other per-field error examples (`rich-forms.md:27`, `:149`; `per-form-contracts.md:81`), the `plugin.yaml` validator description update, and rewrite the `aria-live` part of `rich-forms.md` §6 bullet `:342-344` (keep the error outside the `<label>` and linked with `aria-describedby`, always present, with no live region on it; the plugin announces blur errors through `statusMessage`). Also rewrite the status-region bullet `:348` (visually-hidden option) and add to it that the plugin also announces blur-found field errors through `statusMessage`, read after the next field's name. `user-visible-messages.md`: `:28` cell — hidden-field errors are in `statusMessage` "until the next blur announcement"; `:51` — the `REJECTED` branch gets static copy, with a note that a hook's text reaches the visitor through the always-present status region (and is replaced by a later blur announcement; use `onSubmitOutcome` to keep it); `:59` sentence updated to match; `:64-67` — replace the conditional `<p class="form-status" if="contact.statusMessage">` with an always-present `role="status"` region and update the text (holds a blur error between submits; still never test it for failure). `agent-kit/designer/wix-forms-dashboard-content.md:75` — `statusMessage` holds the submit's English default _or_ a blur-found field error.
- CHANGELOG `## Unreleased`, under a "Behaviour change" heading: `statusMessage` now holds blur-found errors between submits, and the new warning. It says that this affects every site at runtime on upgrade, with no opt-out, so the release owner can choose the version (this log does not). It records the known gap: blur announcements were verified on VoiceOver + Safari only; NVDA, JAWS and TalkBack are untested, including the per-field `aria-live` removal. It includes an **upgrade checklist** of the page edits sites must make:
  1. Bind `{key.statusMessage}` only to an always-present `role="status"` region (visible or visually hidden); remove any `if="…statusMessage"` condition on it.
  2. Remove a visible `{key.statusMessage}` line that duplicates field errors, or accept that it now shows blur errors.
  3. In `submitFailure === REJECTED` (and other failure) branches, replace a bound `{key.statusMessage}` with static copy; use `onSubmitOutcome` to keep a hook's message on screen.
  4. Remove `aria-live` (and `role="alert"` / `status` / `log`) from per-field error elements; keep the `aria-describedby` link.
- `yarn test` and `npm run validate` in the package → all green; guide examples produce no new warnings.

**Phase 4 — demo of the announcer** (`/demo-feature`) on an example app, plus the human re-listen (Verification), and append Implementation Results.

**Phase 5 — page wording (`registerFieldChecks` third argument).** Starts after Phase 4. Independent of the announcer: it changes only which text becomes the field's `error`, so it is correct whether or not the announcer ships. Write tests 24–30 first (red as labelled; for these tests "red" means red at the start of Phase 5, with the announcer already shipped), then implement `FieldMessages` / `FieldCheckOptions` and the context, `page-checks.ts` `pageWordingFor`, the `checkField` and rejection-branch changes, and the exports. Guides: `rich-forms.md:145-155` (`errorRule`): replace the branches with the page-wording pattern below; page-checks section (`:176-205`): document the third argument; `wix-forms-dashboard-content.md:75`: field error wording can be the page's own via `registerFieldChecks` messages. CHANGELOG: the new optional argument (additive). `yarn test` and `npm run validate` → all green; existing two-argument tests unchanged. Demo addendum: a page with registered wording shows and announces the page's text.

Guide example for a page that words its errors (replaces the branches at `rich-forms.md:148-156`):

```ts
forms.registerFieldChecks(
  CONTACT_FORM_ID,
  {},
  {
    messages: {
      email: {
        [FieldRule.REQUIRED]: 'Indiquez votre e-mail.',
        [FieldRule.EMAIL]: 'Cette adresse e-mail ne semble pas valide.',
        [FieldRule.SERVER]: 'Nous ne pouvons pas accepter cette adresse.',
      },
    },
  },
);
```

```html
<span id="c-email-err">{contact.email.error}</span>
```

The guide states: word each rule once here, bind `{error}`, and keep `errorRule` for styling or for markup that differs per rule — if a page keeps literal text in `errorRule` branches, it must pass the same text in `messages`, or VoiceOver reads a different text from the one shown (Q13).

## Verification Criteria

- Phase 0 results table filled in; done: row 8 recorded (delay `0`, switch removes, gap NVDA / JAWS / TalkBack untested, no product re-confirmation needed).
- All tests 1–30 green (red cases turned green, guards still green); full package suite and `validate-plugin` green; no new validator warnings on the guide examples.
- Existing tests updated in Phase 3 as listed (`wix-form-bindings-validator.test.ts:183-195` pattern; chip fixture + `rich-forms.md:278` pair); no other existing test changed.
- No guide example binds `statusMessage` outside the always-present status region: `grep -rn 'statusMessage}' agent-kit` lists only `role="status"` regions (reviewed by hand; this also catches the `REJECTED` branch at `user-visible-messages.md:51`), and `grep -rn 'if="[^"]*statusMessage' agent-kit` returns nothing.
- Demo video: tab out of an invalid field, the status region fills right after (next task); fix it, it empties; submit replaces it; **press Enter inside an invalid dirty field → focus jumps to the first invalid field and the status region stays empty**; **announce a field, then submit successfully → no blur text beside the confirmation**; **a server rejection, then an invalid blur → the status region shows the blur error and the page's `REJECTED` copy is unchanged**; **a page with registered wording → the field and the status region show the page's text**.
- **Post-implementation human re-listen on VoiceOver + Safari** (NVDA recommended if available), with per-field `aria-live` removed (Phase 0): (a) leaving a field invalid → hear the next field's name, then the error; (b) leaving it invalid again → error re-read; (c) fixing it → nothing extra heard; (d) submit errors and submit status as before; (e) no double reading (switch = removes: checked with `aria-live` removed; switch = keeps: with it kept — Phase 0 chose removes); (f) Enter-key submit from an invalid field → only the focused field's error is heard (via `aria-describedby`), no status reading; (g) a successful submit after a blur announcement → only the confirmation is heard; (h) after a server rejection, leaving a field invalid → the field's error is heard once, nothing assertive; (i) on a page with registered wording → the page's wording is heard. (i) is checked after Phase 5. If (a) fails at `0`, try the larger spike delays (150 / 500 / 1000 ms) by changing `BLUR_ANNOUNCE_DELAY_MS` and record it in Implementation Results; if none works, the stop rule (Phase 0 decision table, row 1) applies.

## Trade-offs

- **Shared channel**: reusing `statusMessage` avoids a contract change but means a visibly rendered status line now shows blur errors, and a blur announcement replaces a rejection's status text, including hidden-field errors (Q12). Mitigated by guide + CHANGELOG.
- **Stale text** (Q3) can remain in the region until the next blur/submit/fix. Silent for screen readers; visible only on pages that render it.
- **Deferred write, measured on one reader** — the clear-then-next-macrotask write was verified on VoiceOver + Safari only. **Known gap: NVDA, JAWS and TalkBack are untested**, and removing per-field `aria-live` affects every screen reader; recorded in the CHANGELOG. The named constant lets a later listen raise the deferral without a design change.
- **Validator** may warn on existing consumer pages that followed the old guide. It is a warning, suppressible, and points at the fix.
- **Page wording lives in TypeScript, not jay-html.** One source for visible and announced text, at the cost of moving per-rule copy out of the template. Pages that keep literal `errorRule` branches can drift from their `messages`; no validator can see it (Q13).
- **The busy gate relies on synchronous `exec$`** for the `:351` focus blur (Q11) — true in the runtime the plugin runs in today.

## Scope pre-mortem — how could this fail?

- _Submit-wins leak_: a blur during the await window after `:413` announcing on an outcome that never writes `statusMessage` — closed by the busy gate; tests 13–15.
- _Invalid edit during a successful flight, announced by the removal blur_ — closed by `cancel()` + the `isSubmitted` gate from `showSubmitted`; test 21.
- _Plugin focus move announces_ (Enter-key submit, rejection) — closed by the busy gate (Q11); test 16 proves the blur ran and stayed silent. If jay ever deferred `exec$`, test 16 goes red in that mode — revisit then, not before.
- _Stale write after teardown / bfcache restore_ — `pagehide` + effect cleanup; tests 17 and 19 (17 needs the `window` stub, or it is vacuous).
- _Honeypot removal blur_ — the same `showSubmitted` rule; test 20.
- _A fixed field keeps its announcement_ (typing, blur, `control`, chip) — `withdraw` on every fix; tests 4, 5, 23.
- _Ownership bug clears a server rejection_ — test 7.
- _Rejection text shown in a failure branch is overwritten by a blur_ — guide stops binding `statusMessage` in failure branches; verification grep and demo/VoiceOver (h).
- _G2 regression_ — test 10.
- _Consumers keep `aria-live` on errors_ → double reading; the validator warning is the guard.
- _A page words its errors in jay-html but VoiceOver reads the English default_ (localised pages) — closed by `registerFieldChecks` `messages`; tests 24–30; guide example. Residual: a page that registers nothing, or keeps branches with different text, still announces the default / registered text — guide only (Q13).
- _Page wording leaks into `CUSTOM` / `HOOK` text_ — excluded by rule; test 27.
- _Label-less custom messages_ ("Required") announced without context — guide recommends standalone messages; flagged, not solved.
- _Out of scope, on purpose_: announcing on control/chip commits, a separate announcement tag, other screen readers (beyond the recorded gap), page wording for hidden fields or for `statusMessage` lines.

## Review history

**Round 1 (verdict NEEDS-WORK)** — every finding verified against the code and resolved in this revision:

- **B1** (client-validation stop and success never clear a blur text scheduled during the submit awaits): replaced per-outcome `cancel()` calls with an invariant — `cancel()` + clear at submit start, plus a busy gate in `handleNativeBlur` for the whole flight. Added the "Submit outcome paths" table, Q10 and tests 13–15.
- **B2** (the plugin's own `focus()` blurs the visitor's field and announces): `whileMuted` added to the announcer and applied to every plugin focus move; Q11, test 16. (Withdrawn in round 3.)
- **B3** (some "red" tests already pass): each Phase-1 case labelled **[red]** or **[guard]**; TL;DR reworded.
- **N1**: `:412` early-return framing replaced with the await window in Design and the pre-mortem.
- **N2**: single instruction — `validateField` stays `void`; `handleNativeBlur` reads `errorByTarget`.
- **N3**: `withTimeout` re-described as a one-shot timeout, cited only for handle hygiene.
- **N4**: fake-timer protocol specified.
- **N5**: `pagehide` cancel and a `createEffect` cleanup; Q6 rewritten; test 17.
- **N6**: `cancel()` contract stated.
- **N7**: rule covers `role="log"`, excludes `aria-live="off"`; message reworded; tests added.
- **N8**: verification criteria (demo + VoiceOver f/g) for the Enter-key submit and the success path.

**Round 2 (verdict NEEDS-WORK, one blocking)** — every finding verified against the code and resolved:

- **1 (blocking)**: tests 6, 8, 9, 14, 16, 17 relabelled **[guard]**; tests 13 and 15 assert the announced text in setup; TL;DR counts fixed.
- **2**: honeypot rows corrected; gated through `showHoneypotSuccess` (superseded in round 3 by the `showSubmitted` rule); test 20.
- **3**: success row reworded; test 15 dispatches the removal blur.
- **4**: test 16 states A precedes B in `fields`.
- **5**: validator check placed before `if (!ref) return;`, after the label branch.
- **6**: test 19 (unmount); harness exposes `unmount`.
- **7**: Phase 3 replaces the conditional `if="contact.statusMessage"` region; added to Verification Criteria.

**Round 3 (verdict NEEDS-WORK, two blocking)** — every finding verified against the code and resolved:

- **1 (blocking, `whileMuted` redundant, test 16 vacuous)**: confirmed — `FakeInput.focus` is a bare `vi.fn()` (`test/support/wix-form-harness.ts:109-115`); `exec$` invokes its handler synchronously (public behaviour, test 16); `:351` runs while busy on both paths (`:453`/`:476`; `form-submit-execution.ts:45`/`:49`); reset `:338` meets a cleared form; `:346` is now under the `isSubmitted` gate. `whileMuted` **dropped** (option a; Q11, null hypothesis). Test 16 rewritten: `inputA.focus` dispatches B's blur via `listenerFor`, and a page-check spy's call count proves B's blur validated, independent of `showClientErrors`.
- **2 (blocking, success-path hole)**: confirmed (busy clears at `form-submit-execution.ts:49` before the removal blur). One rule for honeypot and success: `showSubmitted()` calls `cancel()`, and the gate reads the existing `isSubmitted()` signal (written only at `:333`, `:344`) — the planned `suppressBlurAnnounce` flag is gone. Test 21 (invalid edit typed during the flight, then the removal blur).
- **3**: `window` stub for test 17 specified (node environment, `wix-form-validation-timing.interactive.test.ts:1`; precedent `wix-form-submit-outcome.interactive.test.ts:150-160`).
- **4**: verified which existing tests break. Only `wix-form-bindings-validator.test.ts:183-195` breaks from the warning; the chip test runs compiler validations only (`rich-forms-chip-example.test.ts:31-53`) but pins `rich-forms.md:278` to the fixture verbatim (`:79-90`), so both change together; `old-contract-compat.test.ts:115-128` does not run the bindings validator. Phases reordered: the validator rule moves to Phase 3 with the guide, fixture and test edits, so every phase ends at its stated state.
- **5**: `user-visible-messages.md:51` and `:28` addressed (Q12, guide edits, a grep that catches `:51`, `wix-forms-dashboard-content.md:75`).
- **6 (product decision)**: page wording through an optional `messages` map on `registerFieldChecks`, used as the field's `error` so visible and announced text are one; default text when none; null hypothesis, Q13–Q14, tests 24–30 (renumbered in round 5), guide example, verification, pre-mortem. Drift risk recorded; no validator (runtime TypeScript registration; false-warning rule).
- **7**: wording made consistent (no `whileMuted`, no separate flag; interface block complete); test 7's sequence spelled out.
- **8**: line numbers refreshed (`runFormSubmit` `:460`, `finally` `:476`, `showHoneypotSuccess` `:482-485`, confirmation focus `:346`, client stop `:452-455`, `afterRemount` `:261`).
- **9**: `handleControl` / `handleOptionToggle` withdraw when the commit fixes the field; Q5, test 23 (renumbered in round 5).
- **10**: demo and VoiceOver (h) for rejection-then-blur, (i) for page wording; existing-test updates in the "done" list.

**Round 4 (verdict NEEDS-WORK, two major)** — resolved:

- **M1 (core claim unverified)**: assumption stated in Problem; Phase 0 human spike (static page, 0 / 150 / 500 / 1000 ms, VoiceOver + Safari, NVDA if available) with per-delay pass criteria, the delay chosen from results, a stop rule with alternatives, and the per-field `aria-live` decision. Phases 1+ gated on it. The unsourced precedent was dropped; GOV.UK's advice to validate on submit is noted as context.
- **M2 (number collision)**: renumbered to #59; readme row, self-references and the planned doc comment updated; merge-order note added.
- **m1**: jay behaviour stated as public API (`exec$` synchronous, `createEffect` cleanup on unmount), pinned by tests 16 and 19; no dist paths.
- **m2**: status line reworded.
- **m3**: page wording moved to its own Phase 5, with its independence from the announcer stated.
- **m4**: CHANGELOG upgrade checklist; runtime impact stated, version left to the release owner.
- **m5**: test 22 after the round-5 renumbering (A announced, B left valid → A kept; A typed valid → `''`).

**Round 5 (verdict NEEDS-WORK, one major)** — resolved:

- **M1 (test numbering)**: one numbering — 1–23 announcer and validator (Phases 1–2; 22 is the A-kept guard, 23 the control/chip withdraw), 24–30 page wording (Phase 5). Every reference updated: TL;DR red/guard lists, Q5, Phase 1/2/5, Verification, pre-mortem, review history. Phase 2 ends "1–23 green except 18".
- **m1**: the VoiceOver re-listen and (e), the Phase 3 `aria-live` guide edits and test 18 are conditional on Phase 0 keeping the per-field `aria-live` removal.
- **m2**: `checkField` cited from its first line (`:160-169`).
- **m3**: if NVDA is not tested, the `aria-live` decision is made from VoiceOver alone and recorded as a known gap.

**Round 6 (verdict NEEDS-WORK, one major)** — resolved:

- **M1 (Phase 0 `aria-live` decision not carried through)**: one named switch, _if Phase 0 removes per-field `aria-live`_, defined in Phase 0 and referenced by name in the TL;DR (`aria-live` advice, validation warning), Problem behaviour 6 (with product re-confirmation if Phase 0 keeps `aria-live`), the validator section and `plugin.yaml` update, the Phase 3 heading and bullets (validator-test pattern, chip pair, guide edits), the CHANGELOG warning and checklist item 4, Verification (test 18 excluded, existing-test edits conditional), test 18, Trade-offs and the pre-mortem.
- **m1**: TL;DR removal condition uses Phase 0's wording (double reading on any tested screen reader, or no gain).
- **m2**: Phase 0 outcome for VoiceOver passing and NVDA failing every delay: ship the VoiceOver delay, keep per-field `aria-live`, record the gap.
- **m3**: tests 4, 5, 13, 15 use the `[guard] (red part: the setup assertion)` label like 7, 22, 23, 28; test 5's setup spelled out; TL;DR lists updated.
- **m4**: status line counts rounds 1–6.
- **m5**: `pageWordingFor` is returned by `createPageCheckRunner` (`page-checks.ts:27`); each registration is one `{ checks, messages }` record, keyed by identity for both unregister (`wix-forms-context.ts:141-144`) and the unknown-target scan (`page-checks.ts:32`, `:39-49`).
- **n1**: busy clearing cited as `setBusy(false)` in `finally` `:476-478`.

**Round 7 (verdict NEEDS-WORK, one major)** — resolved:

- **M1 (two Phase 0 rules conflict)**: the separate Phase 0 rules are replaced by one Phase 0 decision table covering every combination of VoiceOver result, NVDA result and double reading; each row gives the outcome, delay, switch value, gaps and product re-confirmation of behaviour 6. VoiceOver double reading wins over an NVDA failure (row 5). The stop rule is row 1. The TL;DR, behaviour 6, Trade-offs and Verification point at the table.
- **m1**: test 25 is a plain **[guard]**; "red" for tests 24–30 means red at the start of Phase 5; TL;DR lists updated.
- **m2**: `createPageCheckRunner` returns `{ runPageChecks, pageWordingFor }` instead of the `PageCheckRunner` function (`page-checks.ts:18-21`); call-site edits at `wix-form.ts:131` and `:167` stated.
- **m3**: §6 range is `rich-forms.md:342-344`; what §6 says about blur announcements is stated for both switch states.
- **m4**: the switch name is written in italics everywhere, never bold inside bold.

**Round 8 (verdict READY-FOR-DEVELOPMENT, five minor)** — resolved with the Phase 0 results:

- **1** (the "0 ms passes = stop" rule overlaps rows 2–9): resolved by the results — the rule is replaced by a recorded outcome (a 0 ms pass maps to rows 2–9 like any delay); Q7, Problem, Phase 0.
- **2**: renamed to "per-field `aria-live` redundant (double reading or no gain)", judged at the chosen delay.
- **3**: row 6's gap reads "status read-out cut off or mistimed; where it is heard, it repeats the field's live error".
- **4**: Verification (e) uses the switch values "removes" / "keeps".
- **5**: status line counts rounds 1–8.

**Phase 0 results (2026-11-17)** — VoiceOver + Safari passed at 0 / 150 / 500 / 1000 ms with no difference heard; repeat leave re-read; per-field `aria-live` redundant. Row 8 applied: `BLUR_ANNOUNCE_DELAY_MS = 0` (clear now, write on the next macrotask), 150 ms removed throughout; per-field `aria-live` removed, so the validator warning, test 18 and the Phase 3 `aria-live` edits are in; no product re-confirmation of behaviour 6; NVDA / JAWS / TalkBack untested, recorded as a known gap here and in the CHANGELOG notes. TL;DR, Problem, behaviours 1 and 6, Prior Art, null hypothesis, Q2, Q7, Design, Phases 0–3, tests, Verification, Trade-offs and pre-mortem updated.

## Implementation Results

Implemented 2026-11-17 on `forms-blur-announce`, on base `79683ad`. **Not rebased:** `git rebase origin/main` (one new commit, `3d74579`, bookings phone format) conflicted on `design-log/readme.md` (the table rows), so it was aborted; every `file:line` citation above is still valid on this base. Whichever branch merges second rebases the readme row (as stated at the top).

Commits: design log; Phase 1 (tests, red); Phase 2 (announcer); Phase 3 (validator, guides, CHANGELOG); Phase 5 (page wording); this section. No package version or dependency range changed.

### Tests (red → green)

- **Phase 1** — tests 1–17 and 19–23 in `test/wix-form-validation-timing.interactive.test.ts`, test 18 in `test/wix-form-bindings-validator.test.ts`, plus 10 unit tests in the new `test/blur-announcer.test.ts`. Red on the pre-implementation component (checked by running the new cases against `79683ad`'s `wix-form.ts`): 1, 2, 11, 18 and the setup assertions of 4, 5, 7, 13, 15, 22, 23 — as labelled — **plus 17 and 19** (see deviations). Guards green: 3, 6, 8, 9, 10, 12, 14, 16 (both variants), 20, 21. Unit tests red with `createBlurAnnouncer is not a function` (the module held only the Phase 0 constant in Phase 1, so the interactive file could import it and fail per case).
- **Phase 2** — every Phase 1 test green except 18. Package: 613/617 (the 4 red are test 18's four live cases).
- **Phase 3** — 18 green; the accessible-pattern test's pattern updated (drop `aria-live`, add the status region; expectation `[]` unchanged); chip fixture + `rich-forms.md` §4b pair updated together. Package: 617/617.
- **Phase 5** — tests 24–30 in `test/wix-form-page-checks.interactive.test.ts`. Red at the start of Phase 5: 24, 26, 27 (EMAIL and SERVER cases), 29, 30 and the setup assertion of 28. Guards green: 25 and 27's HOOK / CUSTOM half. Existing two-argument page-check and context tests unchanged and green. Package: **626/626**.
- **Gate**: `yarn install`, `yarn build`, `yarn confirm` all exit 0. `yarn confirm` test counts per package: wix-forms 626/626; the others 108/108, 61/61, 44/44, 42/42, 38/38, 11/11 (×3), 8/8, 3/3. The formatter's edits to unrelated files (examples' `wix-request-session.md`, `wix-data/test/setup-before-init.test.ts`) were restored. `npm run validate` (validate-plugin) passes.

### Deviations

1. **Fake-timer protocol.** `vi.advanceTimersByTimeAsync(0)` does not fire a 0 ms timer under vitest's fake timers here (observed: the timer count stays 1). The harness's `flush` is `vi.runOnlyPendingTimersAsync()`, and "advance" runs it twice: once for the announcer's write, once for jay's reactive auto-batch, which that write schedules because it happens outside an event handler (the view state only shows it after that flush). "Not yet" is still asserted synchronously after the event.
2. **Tests 17 and 19 were red, not guards.** 17's required setup assertion ("a `pagehide` listener was captured") fails on today's code, which registers none. 19 is made non-vacuous by asserting the announcer's pending timer is gone after `unmount()` (`vi.getTimerCount()` > 0 before, 0 after), which also fails today (no timer). The `createEffect` cleanup does run on unmount in this runtime (Q6 fallback not needed).
3. **Test 23's chip half is not covered by an interactive test.** A chip field binds no native `input`, so it can never own a blur announcement; the harness cannot give one target both a chip group and an input. `handleOptionToggle` calls the same `withdrawIfFixed` as `handleControl`, which test 23 covers.
4. **Test 12** needed the chip field in `fields` (a harness setup slip, fixed before the red run).
5. **Phase 5 tests use real timers + the file's `settle()`** (a 10 ms wait covers the 0 ms write and the reactive flush) instead of fake timers; they assert values, not timing.
6. **No `registeredFieldMessages`.** The context exports `registeredFields(context, formId): FieldRegistration[]`; `registeredFieldChecks` maps over it and `createPageCheckRunner` reads the records directly (it needs record identity for the unknown-target `WeakSet`), so a separate messages accessor would be dead code.
7. **Small helpers in `wix-form.ts`**: `withdrawIfFixed(field)` (shared by `handleControl` / `handleOptionToggle`) and `inPageWording(rejection)` for the rejection branch. `page-checks.ts` gained `ownEntry` for the own-property lookup now used twice.
8. **Phase order**: Phase 5 was implemented before the Phase 4 demo so one recording covers the page-wording addendum.
9. **Validator**: `attribute` on the finding is `aria-live` or `role`; the suggestion names the page's own key (`{contact.statusMessage}`), not `{key…}`.
10. Test 2 in the log ("observe both writes") is asserted through the view state: `''` synchronously after the second blur, then the text after advance.

### What the log got slightly wrong

- Test 17 and 19 labels (deviation 2).
- "Only `wix-form-bindings-validator.test.ts:183-195` breaks from the warning" — the same file's `should accept the rich-forms §4b checkbox-chip example` (`:372-378`) also reads the chip fixture through the bindings validator and broke; fixed by the planned fixture edit.
- Page `messages` are keyed by **field target** (as checks are), not the contract tag name; on a form whose tags differ from targets (`firstName_5820` / `first_name_5820`) a page that uses the tag gets the unknown-target warning. The guide says "target" and its examples use forms where they match.

### Demo (Phase 4)

QA testbed (`qa-testbed/testbed`, site of the QA forms) with a locally packed wix-forms tarball and a new page `src/pages/dl59` (accessible pattern: no `aria-live` on errors, visually hidden `role="status"` region; page wording for first name REQUIRED). `jay-stack agent-kit` and `validate` pass; the new page has no warnings, and the older `contact` page now gets the new "announced twice" warning on its five live error spans, as intended. Playwright (1440×900) with a caption overlay and a readout of every write to the status region: **9/9 checks passed** — no live per-field errors; status empty in the leaving task and holding the error on the next task; repeat leave clears then rewrites; fixing clears with no new write; page wording shown and announced; Enter-key submit from an invalid field writes no blur text and focuses the first invalid field. Video: `dl59-blur-announce-demo-2026-11-17.webm` at the workspace root. No submissions were made. Not demoed (need a real submission): success-after-announcement and rejection-then-blur — covered by tests 15, 21 and 7, and by re-listen steps g and h.

### Pending

- **Human VoiceOver + Safari re-listen** (Verification (a)–(i)), script `a11y-spike/RELISTEN-SCRIPT.md` in the workspace (outside the repo). The status becomes `[Implemented]` once it passes; NVDA, JAWS and TalkBack remain an untested known gap (CHANGELOG).
- Agent feedback (jay-feedback): both, as designed — the guides (`rich-forms.md` §1, §3 `errorRule` + page checks, §4b, §6; `per-form-contracts.md`; `user-visible-messages.md`; `wix-forms-dashboard-content.md`) and the bindings-validator warning.

### Address parts addendum (2026-11-17)

Implemented as designed in "Addendum (2026-11-17): address parts" below. Commits: addendum (design); tests (red); implementation + CHANGELOG + these results.

- **Tests (red → green)**, in `test/wix-form-address.interactive.test.ts`: (a), (b), (c), (d owned), (f), (g) red on the pre-change component (nothing reached `statusMessage`). (d pending), (e) and (G2) were guards, green before and after. All 13 in the file pass after. Package: **876/876**.
- **Deviation (test harness).** The address harness runs real timers and the view state updates only after jay's batch, so "clears, then re-reads" (b) and "fixed silently" (c) assert the sequence of rendered `statusMessage` values (`statusRenders`) rather than a synchronous `''`.
- **Deviation (fixture).** (d) uses `addressLine`, which US has and IL lacks (the fixture's IL layout uses street name/number); `postalCode` is shown for every fixture country.
- **Observed (by design).** A part that already **shows** an error (because leaving another part validated the whole address) announces when left, even if untouched, matching a native field that shows an error. A part with no visible error stays quiet (G2).
- **Gate:** `yarn install` and `yarn confirm` exit 0 (wix-forms 876/876, wix-bookings 173/173; the others 108, 44, 42, 38, 11 ×3, 8, 3, all green). The formatter changed no unrelated files. No package version or dependency range changed.
- **Demo:** QA testbed page `src/pages/dl59-address` (form "QA Address LF0 v2", both addresses bound, a visible `statusMessage` readout plus a log of every write to the `role="status"` region), with a tarball packed from this branch. Playwright at 1440×900 with captions: **4/4 checks passed**. (a) at the leave the region is `''`, and on the next task it reads "Address is required."; (b) a repeat leave writes `''` then the error; (c) typing a fix writes only `''`; (d) choosing Israel removes Address and its announcement, with only `''` written. No submissions. Video: `dl59-address-blur-announce-2026-11-17.webm` at the workspace root.
- **Pending:** a human VoiceOver re-listen of the "Address parts" steps in the workspace re-listen script.

## VoiceOver re-listen results (2026-11-17)

A person ran the re-listen on the real form (QA testbed page with a wix-forms contact form), macOS Safari + VoiceOver, on the implemented code.

| Check                                                        | Observed                                                                          | Result |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------ |
| `ann@` in E-mail, Shift+Tab to First name (a text field)     | "First name…", then the e-mail error                                              | Pass   |
| `ann@` in E-mail, Tab to the Interests chip group, then wait | the group and "News" are read, then the e-mail error, then VoiceOver's usage hint | Pass   |
| The same, after a page reload, three runs                    | the error is heard 3 of 3                                                         | Pass   |

**Observation:** on the first try the error was not heard, because the tester moved on before VoiceOver finished. A polite `role="status"` update is queued behind the next field's speech and can be cut off by further key presses or speech. This is the expected behaviour of polite announcements and is accepted; switching blur errors to an assertive region was considered and not needed.

## Merge of `main` (DL #51/#52 address fields), 2026-11-17

`main` (`1a2541c`) was merged into this branch (`a99c655`). Conflicts in `wix-form.ts`, `CHANGELOG.md`, `plugin.yaml` and the design-log index were resolved keeping both behaviours: page wording (`pageWordingFor`, `inPageWording`) sits beside the address specs (`currentFields()`, learned specs on a rejection). `yarn confirm` green: wix-forms 867/867, wix-bookings 173/173.

**Address errors are not announced on blur (resolved 2026-11-17 by the address-parts addendum below).** An address reports its errors per part (`<target>/<part>`) through `handleAddressBlur`, which does not call `blurAnnouncer`; only `handleNativeBlur` does. So a visitor leaving an invalid address part hears nothing until submit. Neither this log nor DL #52 designs it; deciding it (and which part's text to announce) is a follow-up. Rejected address parts keep Wix's text in `inPageWording`, since page wording is keyed by whole field.

**Code references moved.** The Design section is unchanged; the references above now point at these lines:

| File                                     | Cited   | Now                                       |
| ---------------------------------------- | ------- | ----------------------------------------- |
| `agent-kit/plugin/per-form-contracts.md` | 81      | 128                                       |
| `agent-kit/plugin/rich-forms.md`         | 27      | 28                                        |
| `lib/components/form-view-state.ts`      | 36      | 50                                        |
| `lib/components/submit-outcome.ts`       | 77-92   | 92-140 (main added code inside the range) |
| `lib/components/wix-form.ts`             | 115     | 209                                       |
| `lib/components/wix-form.ts`             | 212     | 366                                       |
| `lib/generators/contract-utils.ts`       | 149     | 237                                       |
| `lib/index.client.ts`                    | 16-17   | 21-22                                     |
| `lib/index.ts`                           | 17-18   | 22-23                                     |
| `plugin.yaml`                            | 22-25   | 22-25 (description line changed)          |
| `agent-kit/plugin/rich-forms.md`         | 145-155 | 146-156                                   |
| `agent-kit/plugin/rich-forms.md`         | 148-156 | 149-157                                   |
| `agent-kit/plugin/rich-forms.md`         | 158-160 | 159-161                                   |
| `agent-kit/plugin/rich-forms.md`         | 278     | 279                                       |
| `agent-kit/plugin/rich-forms.md`         | 342-344 | 374-376                                   |
| `agent-kit/plugin/rich-forms.md`         | 344     | 376                                       |
| `agent-kit/plugin/rich-forms.md`         | 37      | 38                                        |
| `test/submission/run-submission.test.ts` | 417-426 | 419-428                                   |
| `lib/validators/wix-form-bindings.ts`    | 130-131 | 158-159                                   |
| `lib/validators/wix-form-bindings.ts`    | 309     | 337                                       |
| `lib/components/wix-form.ts`             | 131     | 225                                       |
| `lib/components/wix-form.ts`             | 166-168 | 279-281                                   |
| `lib/components/wix-form.ts`             | 255-263 | 409-417                                   |
| `lib/components/wix-form.ts`             | 261     | 415                                       |
| `lib/components/wix-form.ts`             | 405     | 577                                       |
| `lib/components/wix-form.ts`             | 405-409 | 577-581                                   |

## Addendum (2026-11-17): address parts

Approved follow-up to the open note above. The Design section stays as written; this adds the address case.

**Decision.** Leaving an address part announces **that part's** error text through the same `blurAnnouncer`, owned by the part key `addressErrorKey(target, part)` = `<target>/<part>` (DL #52). Ownership and `withdraw` are therefore per part: leaving part B valid never clears part A's text.

**Gates — the same as `handleNativeBlur` (`wix-form.ts:385-392`).** No announcement while `isSubmitting()` or after `isSubmitted()`. G2 per part: a part announces only if the visitor typed in it (a new per-part dirty set) or it already shows an error; the address as a whole still validates as today (`handleAddressBlur`, `:349-351`).

**Fixes clear silently.**

- Typing or choosing a select value (`handleAddressInput`, `:339-347`): after the store update, every part of that address with no error withdraws its own key.
- A country change (the `country` part in `handleAddressInput`): it announces nothing new. A part the new layout no longer has, and the subdivision, withdraw (pending or written). Kept parts keep their announcement while their error stands.
- The subdivision free text ↔ select switch is treated as clearing the old owner: a country change withdraws `<target>/subdivision` (above), and learned facts that clear a stale subdivision (`applyLearnedAddressSpecs`, `:777-785`) withdraw it too. That one runs inside a submit, which already cancels the announcer (`:522`, `:535`), so it is belt and braces.

**Where (smallest change).**

- `wireAddressEvents` (`:842`) passes the part to `onAddressBlur(field, part)`; both channels (`input`, `text`) of `subdivision` share the key.
- A shared helper `announceLeave(key)` is extracted from `handleNativeBlur` (`:388-391`): withdraw when the key has no error, else announce when not submitting or submitted. `handleNativeBlur` calls it with `field.target`, `handleAddressBlur` with the part key.
- `withdrawClearedAddressParts(field, { countryChanged })` runs at the end of `handleAddressInput`.

**Bookings.** `wix-bookings`' booking flow has no `statusMessage` region and no announcer (checked: no `statusMessage` / `role="status"` in `wix-bookings/lib` or its agent-kit). Bookings is out of scope, as recorded today.

**Agent feedback (jay-feedback).** Neither. The guides describe blur announcements for "a field" in general, not per field type, so they already cover address parts; nothing new can be caught by a validator.

**Tests** (`test/wix-form-address.interactive.test.ts`, the DOM-free address harness, now with blur): (a) a leave announces on the next task; (b) a repeat leave clears then re-reads; (c) typing a fix clears silently; (d) a country change withdraws a removed part's owned and pending announcement; (e) no announcement during a submit; (f) part A's text survives leaving part B valid; (G2) an untouched part does not complain; (g) the subdivision text → select switch withdraws.

## Addendum (2026-11-17): repeat-leave re-read

Approved follow-up (option A). The Design section stays as written; this changes only what text the announcer writes.

**Evidence.** An automated macOS VoiceOver + Safari run (2026-11-17): type `ann@` in Email, Tab, Shift+Tab back, Tab again. The first leave is read 3 of 3; the **repeat leave is read 0 of 3**. A Playwright trace of the status region shows why: on the repeat leave it goes from `"Please enter a valid email address."` to `""` and back to the identical text about **1 ms** later (WebKit and Chromium). VoiceOver merges the clear and the identical re-write into "unchanged" and says nothing.

**Decision (option A).** When an announcement's text equals the text the announcer last wrote, it writes the text with a trailing non-breaking space (`U+00A0`) instead; the next equal announcement writes the plain text again, and so on. The read text is the same; the DOM value really differs, so the region changes. Delay 0, clear-then-deferred-write, owner, `withdraw` and `cancel` are unchanged. Rejected alternatives: a longer delay (Phase 0 showed delays are what loses the announcement) and a zero-width character (some readers speak it or ignore the change).

**Exact rule.** The announcer remembers the last value it wrote to `statusMessage` (never the clear). On the deferred write of `text`: if the last written value is `text`, write `text + ' '`; otherwise write `text`. Only `statusMessage` carries the toggle; the visible per-field error text is untouched. `cancel()` keeps the memory (a submit or other writer in between is harmless: the worst case is a different-but-equal-sounding value). Nothing compares `statusMessage` for equality: `withdraw` uses the owner key, not the text; page wording sets field errors, not the status; submit outcomes call `setStatusMessage` directly.

**Tests.** Unit (`test/blur-announcer.test.ts`): three consecutive announcements of the same text for the same field write `['', text, '', text + ' ', '', text]`. Interactive (`test/wix-form-validation-timing.interactive.test.ts`): type `ann@` in Email, blur, refocus, blur: the status goes `text` → `''` → `text + ' '`, and the field's own error stays `text`. The existing "repeat leave" tests (unit, validation-timing, address (b)) change their expected re-write to the toggled value.

### Implementation Results: repeat-leave re-read (2026-11-17)

- `blur-announcer.ts`: `distinctFromLastWrite(text, lastWritten)` and a `lastWritten` memory; the deferred write sends `text + ' '` when the last write was exactly `text`. Owner, `withdraw`, `cancel`, delay 0 unchanged. No deviation from the addendum.
- Tests red → green: 4 failing before the fix (new unit toggle test, new interactive `ann@` sequence, and the two existing repeat-leave tests in validation-timing and address (b), updated to the toggled value); after: wix-forms 878/878; `yarn confirm` exit 0.
- Equality audit: no production code compares `statusMessage` text; the only equality checks were those tests.
- Pending: VoiceOver re-listen of the repeat leave on the repacked QA testbed.

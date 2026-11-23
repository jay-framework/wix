# 61 - Reserved space for bound wix-media images (CLS)

**Status:** [Implemented] — approved (product, 2026-11-23); implemented 2026-11-23
**Package:** `@jay-framework/wix-media` (validator + designer agent-kit guide)
**Source:** "Top 10 things AI gets wrong in web dev", point #8 — layout shifts (CLS) and flicker.

## Decisions for the Implementer (TL;DR)

| # | Decision |
|---|----------|
| D1 | Add **one warning** to the existing `media-optimization` validator: `WIX-MEDIA-NO-DIMENSIONS`. |
| D2 | It fires on an `<img>` whose `src`, or a `<video>` whose `poster`, has any binding that resolves to `mediaType: wix-image`, when the element has no reserved space (exact rule in Design → Trigger). |
| D3 | Only **bound** Wix media. Static `<img>` sizing is jay core's job. Jay core's check skips any `<img>` with `srcset`, and bound Wix images normally have one, so jay core does not cover our case (see Prior Art). |
| D4 | Message names the guide by its path in a generated project: `agent-kit/designer/wix-media.md → Reserve space (CLS)`. Boy-scout: the 5 existing messages say `agent-kit/wix-media.md`, which does not exist; fix them to the same path in this change. |
| D5 | Suppression per page: `<script type="application/jay-validations">wix-media: { allow-unsized-media: true }</script>` (same mechanism as `wix-bookings: { allow-unbound-address }`). |
| D6 | The guide teaches the **cheap, always-available fix**: the Wix transform already fixes the box (`/v1/fill/w_400,h_300/…`), so write `width="400" height="300"`. Bind `{width}`/`{height}` only where the contract has them. |
| D7 | No contract changes in this log. Missing dimension tags are listed as follow-up (Q4). |
| D8 | `<source>` elements are skipped (Q5); the `<img>` in the `<picture>` carries the size. |
| D9 | Existing tests that gain the new warning are changed on purpose, listed one by one in Phase 2 — never by copying output. |

## Background

- The validator is `packages/wix-media/lib/validators/media-validator.ts`, registered in `packages/wix-media/plugin.yaml:3-6` as `media-optimization`, run by `jay-stack validate`.
- It walks `img`/`video`/`source` (`media-validator.ts:20,55-57`) and resolves bindings, including headless keys (`resolveBindingWithHeadless`, `:32-50`). A binding counts as Wix media when the tag has `meta: { mediaType: wix-image }` (`:93`).
- Today it checks: missing `/v1/` transform (`:59-110`), local image paths (`:77-84`), missing `srcset` on ≥400px images (`:112-133`), unencoded commas in `srcset` (`:135-153`).
- Plugin suppression pattern exists in `packages/wix-bookings/lib/validators/booking-flow-bindings.ts`: constants `PLUGIN_KEY`/`SUPPRESSION_KEY`/exported code (`:21-23`), `isSuppressed(ctx)` (`:48-50`); messages start with the code (`:66`).
- The guide's source is `packages/wix-media/agent-kit/designer/wix-media.md`; it is copied into each example as `examples/*/agent-kit/designer/wix-media.md`. The existing messages (`media-validator.ts:73,80,104,126,146`) point at `agent-kit/wix-media.md`, a path that does not exist.

## Problem

An AI writes `<img src="{mainMedia.url}/v1/fit/w_800,h_800/x.webp">`. Until the image arrives the box is 0px high, then the page jumps. Nothing in `jay-stack validate` says so for **bound** Wix images: jay core cannot see that a binding is a Wix image, and wix-media only talks about transforms and `srcset`.

### Audit claim — verified, with corrections

| Claim | Verdict |
|---|---|
| "validator covers srcset only (`:112-126`)" | **Partly wrong.** `:112-133` is the `srcset` warning, but the file also checks transforms, local paths and srcset commas. None of them look at `width`/`height`/`aspect-ratio` — so the *gap* is real. |
| "bound media gets no dimension guidance" | **True.** `packages/wix-media/agent-kit/designer/wix-media.md` (125 lines) mentions `w_`/`h_` only as transform params (`:49-52`); no CLS / reserve-space section. |
| "images/video from Wix media bindings" | **Video is narrower than stated.** No contract has a `wix-video` media type (grep: zero hits). The only detectable bound video is `<video poster="{…wix-image…}">`. |
| "contract exposes width/height" | **Only sometimes.** `wix-stores` `product-card.jay-contract:72-80` (thumbnail) and `wix-stores-v1` `product-card`/`category-page` have `width`/`height`. `mainMedia` (`product-card.jay-contract:37-50`), `media.jay-contract:4`, `wix-cart` `cart-page.jay-contract:77` do **not**. `wix-pro-gallery` has `width`/`height` (`pro-gallery.jay-contract:50-51`) but its `url` has no `mediaType` meta, so the validator never sees it. |

## Prior Art / Adjacent Mechanisms

| Mechanism | Covers | Why not enough |
|---|---|---|
| jay core SEO check in `jay-stack validate` (`@jay-framework/seo-validator` 0.26.5) | Warns on `<img>` without `width`+`height` (or inline `width:`+`height:`) | **Confirmed in source:** the condition is `(!hasInlineWidth \|\| !hasInlineHeight) && !srcset`, so it skips any `<img>` with `srcset`, and it ignores `aspect-ratio`. Bound Wix images normally carry `srcset` (the guide teaches it), so jay core does not flag them. Also cannot point at the Wix transform fix. |
| `media-dimensions` design-system warning | `<video>`/`<iframe>` only | Proposed in jay, not released. Does not cover `<img>`. |
| `media-optimization` srcset warning (`:112-133`) | Responsive sizes | Says nothing about reserved space. |
| Agent-kit `wix-media.md` | Transforms, srcset | No CLS section. |

## Null hypothesis

"Do nothing; jay core's generic img rule is enough." Rejected for **bound** Wix media because: (1) the fix is Wix-specific — the transform already holds the numbers, and the agent needs to be told so; (2) the `<video poster>` case is not an `<img>`. Accepted for **static** images — we add nothing there (D3).

"Guide only, no rule." Rejected: the repo order is validation first; this mistake is cheap to detect exactly.

## Questions and Answers

**Q1. What counts as "has dimensions"?**
A: See Design → Trigger. In short: both `width` and `height` attributes (static or bound), or an inline `style` that sizes the box. One attribute alone does not count. CSS classes are not read (see Trade-offs).

**Q2. How do we avoid duplicating jay core's img rule?**
A: Double reports are unlikely: jay core skips `<img>` with `srcset`, and bound Wix images normally have one. Overlap is possible only for a bound `<img>` with no `srcset` and no size. At implementation time, run `jay-stack validate` on such a page with the jay version in use and record what it prints. If both fire, keep ours (it carries the Wix fix). Dedupe across plugins is a jay question, out of scope.

**Q3. Severity?**
A: `warning`. CLS is a quality problem, not a broken page, and `width`/`height` are not always right (fluid art-directed layouts with CSS-sized containers).

**Q4. Should contracts gain `width`/`height` next to every `wix-image` url?**
A: Useful but out of scope (touches wix-stores, wix-cart, wix-pro-gallery). Listed as follow-up. The guide's transform-based fix works without it.

**Q5. `<source>` inside `<picture>`?**
A: Skipped. The `<img>` inside the `<picture>` carries the dimensions.

**Q6. Does `width`/`height` break responsive CSS?**
A: No, with `max-width:100%; height:auto` the browser uses the attributes only for the aspect ratio. The guide shows this.

## Design

### Rule

| Field | Value |
|---|---|
| Code | `WIX-MEDIA-NO-DIMENSIONS` (message prefix, like `BOOKINGS-ADDRESS-UNBOUND`) |
| Validator | existing `media-optimization` (`plugin.yaml:3-6`), new check in `media-validator.ts` |
| Severity | `warning` |
| Elements | `<img>` (attr `src`), `<video>` (attr `poster`) |
| Trigger | **any** binding inside the `src`/`poster` value resolves (via `resolveBindingWithHeadless`) to `meta.mediaType === 'wix-image'` |
| Passes (`hasReservedSpace`) | (a) `width` **and** `height` attributes present — static or bound (`{thumbnail.width}`) both count; or (b) static `style` sizes the box (parsing below); or (c) `style` contains **any** binding (`style="{imgStyle}"` or `style="width:80px;{extra}"`) — the whole attribute counts as reserved; its static half is **not** parsed (no warning, avoids false positives) |
| Suppression | `wix-media: { allow-unsized-media: true }` in the page's jay-validations block |
| `attribute` | the attribute where the match was found: `src` (img) or `poster` (video) |
| Message binding | the **first** matching binding in that attribute |

**Static style parsing.** Split `style` on `;` into declarations, split each on the first `:`, trim, lowercase the property name. Sized when there is an `aspect-ratio` declaration, or both a `width` and a `height` declaration whose value is not `auto`. `max-width`/`min-width`/`max-height`/`min-height` do not count (whole property names, not substrings). So `max-width:100%;height:auto` → **not sized** → warning.

**Message:**
`WIX-MEDIA-NO-DIMENSIONS: <img> binds a Wix image ('{mainMedia.url}') but has no width/height or aspect-ratio, so the page jumps when it loads. See agent-kit/designer/wix-media.md → Reserve space (CLS).`
**Suggestion:** `Copy the transform size: /v1/fill/w_400,h_300 → width="400" height="300" (for /v1/fit/, use intrinsic width/height or style="aspect-ratio:…"). <SUPPRESSION_HINT>`

One finding per element, even if several bindings match. An un-transformed bound image with no size gets **both** warnings (missing transform and this one): they are different fixes, and the size fix needs the transform numbers anyway.

**Signatures** (in `media-validator.ts`):

```ts
const PLUGIN_KEY = 'wix-media';
const SUPPRESSION_KEY = 'allow-unsized-media';
export const NO_DIMENSIONS_CODE = 'WIX-MEDIA-NO-DIMENSIONS';
const GUIDE = 'agent-kit/designer/wix-media.md';
function hasReservedSpace(element: HTMLElement): boolean;
function isSuppressed(ctx: Parameters<JayHtmlValidatorFn>[0]): boolean; // same as wix-bookings; equals JayHtmlValidationContext
```

### Agent-kit section (`packages/wix-media/agent-kit/designer/wix-media.md` → "Reserve space (CLS)")

Content, short:

```html
<!-- ✅ fill/crop: the transform IS the box -->
<img src="{mainMedia.url}/v1/fill/w_400,h_300/file.webp"
     width="400" height="300" style="max-width:100%;height:auto" alt="{mainMedia.altText}">

<!-- ✅ the contract has intrinsic size (e.g. product-card thumbnail) -->
<img src="{thumbnail.url}/v1/fit/w_400,h_400/file.webp"
     width="{thumbnail.width}" height="{thumbnail.height}" style="max-width:100%;height:auto">

<!-- ✅ size unknown: fix the box with CSS -->
<img src="{mainMedia.url}/v1/fit/w_800,h_800/file.webp" style="aspect-ratio:1/1;width:100%;object-fit:contain">

<!-- ❌ no reserved space -->
<img src="{mainMedia.url}/v1/fit/w_800,h_800/file.webp">
```

Plus one line each: `fit` keeps the original ratio, so use intrinsic size or `aspect-ratio`; `<video poster>` follows the same rules; how to suppress.

### What is not done

No contract tags, no runtime code, no change to static-URL checks, no `<iframe>`.

## Implementation Plan

**Phase 1 — RED tests** in `packages/wix-media/test/validators/media-validator.test.ts` (existing `makeContext`/`mediaContract`/`headlessImports`). Fixture change: add a `thumbnail` tag to `mediaContract` with `url` (`mediaType: wix-image`), `width`, `height`.
- bound `<img src="{mainMedia.url}/v1/…">` without size → 1 warning starting `WIX-MEDIA-NO-DIMENSIONS`, `attribute: 'src'`.
- headless `<img src="{productPage.mediaGallery.selectedMedia.url}/v1/…">` → warning.
- `<video poster="{mainMedia.url}/v1/…">` → warning, `attribute: 'poster'`.
- passes: static `width`+`height`; bound `{thumbnail.width}`/`{thumbnail.height}`; `style="aspect-ratio:4/3"`; `style="width:80px;height:80px"`; `style="{imgStyle}"`.
- only `width` → warning. `style="max-width:100%;height:auto"` → warning. `style="WIDTH:80px;Height:80px"` → passes (case-insensitive). bound url with no transform → both warnings.
- `<picture><source srcset="{mainMedia.url}/v1/…"><img src="{mainMedia.url}/v1/…" width="400" height="400"></picture>` → none (source skipped).
- several matching bindings in one `src` → one warning naming the first.
- static Wix URL without size → none from this rule. `{title}` binding → none. suppression → none.
- Exit: new tests red. Existing tests still green (the rule does not exist yet, so the Phase 2 fixture changes below are made here too and must not change their result).

**Phase 2 — Implement.** Add the check and fix the 5 old guide paths (update their test expectations if they assert the path).

Existing tests in `media-validator.test.ts` that the rule touches (line numbers as of today):

| Test | Line | Why it changes | Change |
|---|---|---|---|
| `flags wix-image binding without optimization params in template` | :89 | bound, unsized, no transform → both warnings (Design) | expect **2** findings on purpose: the transform error and `WIX-MEDIA-NO-DIMENSIONS` |
| `flags headless-keyed binding without optimization` | :119 | same, headless | expect both on purpose |
| `flags binding with w_600 and no srcset` | :237 | is about srcset; filters all warnings | add `width="600" height="400"` to the fixture |
| `passes when srcset is present` | :252 | is about srcset; filters all warnings | add `width="800" height="600"` |
| `handles multiple errors in same file` | :297 | `{mainMedia.url}` img is bound and unsized | expect **4** on purpose (3 old + the new warning, which is correct for that img) |
| `returns no findings for fully optimized page` | :323 | a "fully optimized" img must reserve space | add `width="800" height="600"` to the bound img |

Not affected (checked): :100, :134 (filter `severity: 'error'`), :178 (`arrayContaining`), :198 (filter `attribute: 'srcset'`), :211 (filter `%2C`), :110 (`altText` is not wix-image), and all static-URL tests incl. the srcset ones at :223/:282 (rule is bound-only).
- Exit: all tests green, including the 6 changed above with their new expectations; `yarn build && yarn test` in wix.

**Phase 3 — Guide + changelog.** Guide section in `packages/wix-media/agent-kit/designer/wix-media.md`; CHANGELOG `## Unreleased` entry. **No version bump.**
- Exit: section exists. Example copies (`examples/*/agent-kit/designer/wix-media.md`) are refreshed by running `yarn agent-kit` (`jay-stack-cli agent-kit`) in each example; it copies every `<plugin>/agent-kit/<role>/*.md` into the project's `agent-kit/<role>/` (jay-stack-cli `run-agent-kit`, plugin copy loop, `fs.copyFile`). Generated projects get the file the same way, which is why the message path is `agent-kit/designer/wix-media.md`.

**Phase 4 — Verify + demo.** Q2 overlap check with `@jay-framework/seo-validator` (record the version used; 0.26.5 at design time): bound img **with** `srcset` and no size → only ours; same img **without** `srcset` → jay's fires too; `/demo-feature` (below); status `[Implemented]` here and in `readme.md`.
- Exit: Verification Criteria met, results appended.

## Verification Criteria

- All new tests fail before Phase 2 and pass after; full wix-media suite green.
- `jay-stack validate` prints the warning with file, element and guide path; adding size removes it.
- **Recorded demo** (`/demo-feature`, video at the workspace root): example `examples/whisky-exchange`, page `src/pages/products/page.jay-html` (product card `<img src="{mainMedia.url}/v1/fill/w_400,h_400/…">`, line 128, `width="400" height="400"` at line 134). That card is **also sized by a class**: `theme.css:494-502` `.product-card-image { aspect-ratio: 1 }` on the wrapping `<a>` (line 127), img rule `:504-508`. So removing only `width`/`height` gives CLS ≈ 0 while the rule still warns — this is the accepted class-sized false positive (Trade-offs). Every bound Wix image in the examples is sized somehow (attributes, inline style, or a class like this one).
  - **Local demo edit (not committed), exactly:** in `page.jay-html` delete `width="400" height="400"` from the line-134 img, **and** in `theme.css` remove the `aspect-ratio: 1;` line from `.product-card-image` (:495). Show (a) the warning, (b) the jump, then (c) `git checkout` both files — validate clean, CLS ≈ 0.
  - **Shipped markup stays as is:** the committed `width`/`height` are correct and cheap; no change to the example.
  - **Measure:** a `PerformanceObserver({type:'layout-shift', buffered:true})` summing `value` (ignoring `hadRecentInput`), Chrome DevTools throttling **"Slow 3G"**, cache disabled. Pass: sum **> 0** with both removed, **≈ 0 (< 0.01)** after restore. Both numbers go in Implementation Results.

## Trade-offs

| Choice | Gain | Cost |
|---|---|---|
| Warning, not error | No broken builds for fluid layouts | Can be ignored |
| Inline `style` only, no CSS class lookup | Exact, cheap | **False positive** when size comes from a class (`.card img{aspect-ratio:1}`) — use suppression |
| Bound `style` counts as sized | No false positives | Misses a bound style that sets no size |
| Need both `width`+`height` | Matches what the browser needs for ratio | Flags half-sized markup (intended) |
| Detect only `wix-image` meta | No overlap with jay's generic rules | Misses `wix-pro-gallery` (no meta) and real bound video `src` (no `wix-video` type) |
| Transform-based fix in the guide | Works with every contract today | For `fit`, transform size ≠ real ratio; guide says so |

**Agent feedback loop:** validation (`WIX-MEDIA-NO-DIMENSIONS`) + agent-kit section. No framework change.

## Follow-ups (not in this log)

- Add `width`/`height` next to `wix-image` urls in wix-stores `mainMedia`/`media`, wix-cart; add `mediaType: wix-image` to wix-pro-gallery `url`.
- A `wix-video` media type, if a contract ever binds video `src`.

## Implementation Results (2026-11-23)

**Shipped as designed.** `WIX-MEDIA-NO-DIMENSIONS` warning in `media-validator.ts` (`findUnsizedWixImage`, `firstWixImageBinding`, `hasReservedSpace`, `styleSizesBox`, `isSuppressed`); the 5 old guide paths now read `agent-kit/designer/wix-media.md`; guide section "Reserve space (CLS)" in `agent-kit/designer/wix-media.md`; the 6 example copies refreshed with `yarn agent-kit`; new `packages/wix-media/CHANGELOG.md` with an `## Unreleased` entry. No version bump.

**Tests.** Phase 1 red: 11 failing (every new "warns" case, the guide-path test and the 3 planned expectation changes), "passes" cases green as expected. After Phase 2: wix-media validator suite **60/60**, wix-media package 63/63; `yarn build` 27/27 packages; `yarn test` all green.

**Validate.** `npm run validate` passes in all 6 examples; the new warning fires on none of them (every bound Wix image is sized).

**Q2 overlap, checked against `@jay-framework/seo-validator` 0.26.5** (installed version; `dist/tools.js:54` is still `(!hasInlineWidth || !hasInlineHeight) && !srcset`, so the img rule still skips `srcset`). On `whisky-exchange` `products/page.jay-html` with the local demo edit: with `srcset` → only `WIX-MEDIA-NO-DIMENSIONS`; with `srcset` also removed → jay's "Image missing explicit dimensions" fires too. Both kept, as decided.

**Deviations.**
- The new warning is pushed after the transform error for the same element, so findings keep "error, then warning" order (matches the Phase 2 expectations).
- `hasReservedSpace` is typed with node-html-parser's `HTMLElement` (reviewer note) and the context with `JayHtmlValidationContext`.
- wix-media had no CHANGELOG, so one was created.
- **Demo is not on the live store.** No stores QA site config exists (`whisky-exchange` has no `config/.wix.yaml`; the only QA testbed is the forms site), so the running example renders no products. The video shows (1) the real `jay-stack validate` output with the local edit, then (2) a browser harness that serves the example's committed `theme.css` and the real card markup, with images delayed 2 s, before and after. The local edit was reverted with `git checkout`, and validate was clean again.

**CLS measurement** (Chromium, `PerformanceObserver` `layout-shift`, buffered, `hadRecentInput` ignored, **only shifts whose sources are inside `.product-grid` or the text right below it**, following the reviewer note on using a baseline). `width`/`height` and `aspect-ratio: 1` removed: **0.0674** (dry run) / 0.0621 (recording). Restored: **0**. Pass.

**Final-round reviewer notes, folded in:**
- Baseline/scoped CLS: done, see above.
- Tests at `media-validator.test.ts:265` (`passes when w_ is below threshold`) and `:273` (`does not flag video elements`) are also unaffected: both use static URLs, and the rule is bound-only. Confirmed green unchanged.
- `hasReservedSpace` typed with node-html-parser `HTMLElement`: done.
- Prior-art row "`media-dimensions` design-system warning — proposed in jay": firmed up. It is not in the published jay 0.26.5. It is in design in jay's own log for this effort. It covers `<video>`/`<iframe>` only, so it does not change this rule.
- srcset re-check with the recorded version: done (0.26.5).

**Demo video:** `wix-61-reserve-space-cls-20261123.webm` (workspace root, narrated, 67 s).

**Agent feedback loop:** validation + guide section, as planned. Nothing else is needed.

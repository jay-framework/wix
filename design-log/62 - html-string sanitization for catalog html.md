# 62 - html-string sanitization for catalog HTML

**Status:** [Implemented] (2026-11-23) — approved by product; see Implementation Results.
**Depends on jay:** nothing for the fix itself (sanitizing happens in our own slow render; no jay runtime hook is used — jay does not sanitize html-string anywhere). Only the consumer suppression step (Q3) needs the jay release that adds the `HTML-STRING-TRUST` validate warning.

## Decisions for the Implementer (TL;DR)

1. Product `description` / info-section `plainDescription` stay `html-string` (merchants author rich text), but **wix-stores and wix-stores-v1 sanitize them in `renderSlowlyChanging`, server-side, before they enter ViewState** — so SSR, slow pre-render and client agree.
2. **Sanitizer = `sanitize-html`** (maintained, server-side, no DOM needed, allowlist config). Not hand-rolled: allowlist parsing edge cases (entities in schemes, malformed tags) are exactly what a library has already been attacked on.
3. One function `sanitizeCatalogHtml(html)` in **`@jay-framework/wix-utils`** (`lib/sanitize-catalog-html.ts`) — both packages already depend on wix-utils (`wix-stores/package.json:62`, `wix-stores-v1/package.json:58`). No new package.
3a. **Server-only.** It is exported from a new subpath `@jay-framework/wix-utils/sanitize` (own `exports` entry with its own `types`; `vite.config` becomes multi-entry `lib/index.ts` + `lib/sanitize-catalog-html.ts`, with `sanitize-html` and `entities` in `rollupOptions.external`; today it is single-entry with `external: []`), **not** from `lib/index.ts`: `product-page.ts` already imports the main wix-utils entry and also ships to the client, so putting `sanitize-html` there would grow the client bundle. The subpath is imported only from slow-render code (`renderSlowlyChanging`, `mapInfoSections`, `mapSeoHeadTags`); implementation checks the built client bundle of `examples/store` has no `sanitize-html`.
4. SEO `<meta name="description">` gets **plain text** (`htmlToPlainText`, all tags stripped), not HTML.
5. `img` is **allowed with `http(s)` `src` only** (recorded decision: merchants embed product images in descriptions; `onerror` etc. are stripped anyway).
6. wix-data `richContent` → `string` is already escaped: no change.

## Background / Problem — verified code paths

| Package | Where | Raw HTML into ViewState |
|---|---|---|
| contracts | `wix-stores/lib/contracts/product-page.jay-contract:16,77`; `wix-stores-v1/lib/contracts/product-page.jay-contract:13,72` | `description`, `plainDescription` are `html-string` |
| wix-stores | `lib/components/product-page.ts` `renderSlowlyChanging` (`:419`; slow phase — registered via `.withSlowlyRender(renderSlowlyChanging)` at `:853`) | `description: plainDescription` (`:477`); info sections `plainDescription` via `mapInfoSections` (`:173`, field at `:176`) |
| wix-stores-v1 | `lib/components/product-page.ts` `renderSlowlyChanging` (`:248`; slow phase — `.withSlowlyRender(renderSlowlyChanging)` at `:508`) | `description: product.description` (`:284`); info sections `plainDescription: section.description` via `mapInfoSections` (`:90`, field at `:96`) |
| SEO | wix-stores `mapSeoHeadTags` `:199-204`; v1 (function at `:178`) `:195-200` | the same HTML becomes `<meta name="description" content=…>` |

Catalog HTML is authored in the Wix dashboard and usually safe, but it is still external input (imports, API writes, compromised accounts). Jay renders `html-string` raw on SSR and client, with no default sanitizer. `wix-data/lib/generators/contract-utils.ts:183` maps richContent to `string` → escaped, safe.

## Prior Art

- Jay public surface: `html-string` = trusted markup; `jay-stack validate` warning `HTML-STRING-TRUST` per html-string tag; guidance is "sanitize at the data source".
- Shopify Hydrogen `descriptionHtml` is rendered raw via `dangerouslySetInnerHTML` and leaves sanitizing to the app — we do it in the plugin because agents will not.
- In-repo: `node-html-parser` is already used by wix-forms / wix-media (`package.json:69`, `:67`), but it is a parser, not a sanitizer. No sanitizer dependency exists yet.

## Q&A

1. **Sanitizer choice** — *Decided:* `sanitize-html` in wix-utils (see TL;DR 2). Rejected: DOMPurify (needs jsdom on the server), hand allowlist (security maintenance burden).
2. Keep `style` attributes (merchants use colors)? *Default:* drop `style` (keeps the allowlist free of CSS-based attacks); product may reverse it before implementation.
3. Where is `HTML-STRING-TRUST` silenced? *Decided (follows jay):* jay warns at the **consumer's binding site**, not on the contract, so wix-stores cannot silence it. Each consumer page (our `examples/*`) acknowledges it once in its page script: the jay path format is `<headless key>.<dotted contract tag path>`, with no index for repeated sub-contract items, so for a page importing the product page as `productPage`:

   ```yaml
   jay-stack:
     allow-html-string:
       - "productPage.description"                    # sanitized at source by wix-stores
       - "productPage.infoSections.plainDescription"  # sanitized at source by wix-stores
   ```

   The plugin agent-kit note tells consumers to do the same with their own key. Needs the jay release with the rule.

## Design

| Setting | Value |
|---|---|
| Allowed tags | `p, br, strong, em, b, i, u, s, ul, ol, li, h1-h6, a, span, div, img, blockquote` |
| Allowed attributes | `a: href, target, rel`; `img: src, alt, width, height` |
| Allowed schemes | `a href`: `http, https, mailto`; `img src`: `http, https` (no `data:`) |
| Dropped | every other tag (content of `script, style, iframe, object, embed` removed, not kept as text), every `on*`, `style`, `class` |
| Links | force `rel="noopener noreferrer"` when `target` is present |
| URLs | `allowProtocolRelative: false` (`//evil.com` dropped); relative URLs (`/a`, `a.png`, `#x`) kept — no scheme, so no script |

Exact `sanitize-html` options (expected test outputs follow these):

```ts
{
  allowedTags: [...above],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height'] },
  allowedSchemes: [],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'], img: ['http', 'https'] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  selfClosing: ['img', 'br'],          // serialized as <img ... /> and <br />
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed'],
  disallowedTagsMode: 'discard',       // drop the tag, keep its text (except nonTextTags)
  transformTags: { a: addNoopenerWhenTarget },
}
```

```ts
// @jay-framework/wix-utils
export function sanitizeCatalogHtml(html: string): string   // rich text for html-string tags
export function htmlToPlainText(html: string): string       // for SEO meta
```

`htmlToPlainText(html)` steps (dependency: `entities`, added directly to wix-utils — it is what `sanitize-html` already pulls in via `htmlparser2`, so no new code in the tree):
1. `sanitize-html` with `allowedTags: ['p','br','div','li','h1'…'h6','blockquote']`, `allowedAttributes: {}`, same `nonTextTags`, `disallowedTagsMode: 'discard'` — normalizes markup; output text is entity-escaped once.
2. Replace each remaining tag (now only attribute-less allowlisted tags) with one space.
3. Decode entities once with `decodeHTML` from `entities` (`&amp;` → `&`, `&nbsp;` → U+00A0).
4. Collapse all whitespace incl. U+00A0 to one space; trim.
Result is plain text; Jay escapes it once when it is set as the meta `content` attribute, so no `&amp;amp;`.

Called in both `renderSlowlyChanging` functions for `description`, and in both `mapInfoSections` for `plainDescription`; `mapSeoHeadTags` uses `htmlToPlainText`. Runs once per product per slow render (build/ISR), not per request. No contract or ViewState type change.

## Implementation Plan (red tests first)

wix-utils has no test runner today (`package.json` `"test": ":"`): add `vitest` as a devDependency and `"test": "vitest run"`; no version change.

`wix-utils/test/sanitize-catalog-html.test.ts` — expected outputs written first:

| Test | Input | Expected |
|---|---|---|
| removes onerror from img | `<img src="https://x/a.png" onerror=alert(1)>` | `<img src="https://x/a.png" />` |
| removes uppercase ONERROR | `<img src="https://x/a.png" ONERROR=alert(1)>` | `<img src="https://x/a.png" />` |
| removes svg onload (svg discarded, children kept) | `<svg onload=alert(1)><p>a</p></svg>` | `<p>a</p>` |
| removes script tags | `<p>a</p><script>alert(1)</script>` | `<p>a</p>` |
| removes script inside text | `<p>a<script>alert(1)</script>b</p>` | `<p>ab</p>` |
| drops protocol-relative src | `<img src="//evil.com/a.png">` | `<img />` |
| keeps relative href | `<a href="/shoes">x</a>` | `<a href="/shoes">x</a>` |
| keeps existing rel, forces noopener | `<a href="https://x" target="_blank" rel="nofollow">x</a>` | `<a href="https://x" target="_blank" rel="noopener noreferrer">x</a>` (recorded: forced value replaces any existing `rel`) |
| adds rel on target | `<a href="https://x" target="_blank">x</a>` | `<a href="https://x" target="_blank" rel="noopener noreferrer">x</a>` |
| drops javascript: href | `<a href="javascript:alert(1)">x</a>` | `<a>x</a>` |
| drops entity-obfuscated scheme | `<a href="java&#x09;script:alert(1)">x</a>` | `<a>x</a>` |
| drops data: img | `<img src="data:image/svg+xml,...">` | `<img />` |
| closes malformed tags | `<p><strong>Hi` | `<p><strong>Hi</strong></p>` |
| keeps formatting | `<p><strong>Hi</strong></p>` | unchanged |
| plain text for SEO | `<p>Nice <b>shoe</b></p>` | `Nice shoe` |
| plain text decodes entities, spaces block tags | `<p>Fish &amp; chips</p><p>Size&nbsp;M</p><ul><li>a</li><li>b</li></ul>` | `Fish & chips Size M a b` (entities decoded; each block tag and `<br>` becomes one space; whitespace incl. nbsp collapsed to one space; trimmed. Jay escapes the value when it is set as the meta `content` attribute.) |

Package tests (unit-level mocked catalog service):
- wix-stores: `it("sanitizes description and info-section plainDescription in slow render")`.
- wix-stores-v1: `it("sanitizes product.description and section.description in slow render")`.
- both: `it("uses plain text for meta description")`.

Then implement; `yarn test`, `yarn build`, examples `npm run validate`.

## Demo plan (`demo-feature`)

One concrete seam: a **recorded test run**, no dev-server mock. Record the terminal running the wix-utils and wix-stores/v1 tests above (a mocked product whose description is `<p>Nice</p><img src="javascript:alert(1)" onerror="document.title='XSS'">` comes out as `<p>Nice</p><img />` (the `javascript:` src and `onerror` are both dropped; a relative src like `x` would be kept, so it is not used), meta `Nice`), then open `examples/store` against the existing QA site **read-only** (no product writes) to show a real product description still renders its formatting. Video at the workspace root.

## Verification Criteria

- Tests red → green.
- Demo: tests show the payload neutralized; a real QA product keeps its formatting.
- Rendered product HTML **does** change (unsafe tags/attributes removed; SEO meta becomes plain text).
- `npm run validate` on examples: no errors; before the jay rule release its output is unchanged. After it: each example page binding product description warns `HTML-STRING-TRUST` until its page script lists the tags with reason "sanitized at source by wix-stores"; with that, no warning.

## Trade-offs / pre-mortem

- Over-aggressive sanitizer strips merchant formatting (styles, colors, embeds) → allowlist covers common rich text; `style` is Q2; review against a few real catalog descriptions before release.
- Performance on large catalogs → runs once per product in the slow phase; `sanitize-html` is linear in input size; no per-request cost.
- Sanitizer library bug → maintained dependency + adversarial tests above.

## jay-feedback decision

Validation: none new in wix (jay's `HTML-STRING-TRUST` covers it). Agent-kit: one note in a new file `product-description.md` in the existing `packages/wix-stores/agent-kit/designer/` and `packages/wix-stores-v1/agent-kit/designer/` folders: "description and info-section plainDescription are catalog HTML sanitized by wix-stores; acknowledge `HTML-STRING-TRUST` once per page by listing `"<your key>.description"` and `"<your key>.infoSections.plainDescription"` (quoted) under `jay-stack: allow-html-string`, each with the comment `# sanitized at source by wix-stores`; never bind other user input to html-string." Framework: none.

## Implementation Results (2026-11-23)

**Product decisions applied** (Q2 settled): `style` dropped; `img` with `http(s)` (or relative) `src` only; links with a `target` get a forced `rel="noopener noreferrer"`; SEO meta is plain text; each example page acknowledges `HTML-STRING-TRUST` once.

**Trade-off accepted — forced `rel` replaces merchant `rel`.** A link with a `target` loses any merchant `rel` such as `nofollow`. Merging values was rejected to keep the transform trivial and the output predictable. Links without a `target` keep their `rel` unchanged (covered by a test).

### What shipped
- `packages/wix-utils/lib/sanitize-catalog-html.ts`: `sanitizeCatalogHtml`, `htmlToPlainText`, the options exactly as in Design, and `addNoopenerWhenTarget`.
- `packages/wix-stores` and `packages/wix-stores-v1` `lib/components/product-page.ts`: `description` and the info-section `plainDescription` are sanitized in `renderSlowlyChanging` / `mapInfoSections`; `mapSeoHeadTags` uses `htmlToPlainText`.
- Example pages with the acknowledgement: `store-light` (`products/[slug]`, `products/ceramic-flower-vase`), `studio-store`, `whisky-store` (key `productPage`), `whisky-exchange` (key `p`). `examples/store` binds neither tag, so it needs nothing.
- Agent-kit: `agent-kit/designer/product-description.md` in both store packages.

### Round-6 reviewer notes, folded in
1. **build:types needs the subpath entry.** `build:types` is `tsup lib/index.ts lib/sanitize-catalog-html.ts --dts-only`. The `./sanitize` export points at `dist/sanitize-catalog-html.{js,d.ts}`, and vite builds both entries (`fileName` per entry).
2. **Dependency placement.** `sanitize-html` ^2.17.0 and `entities` ^4.5.0 are regular `dependencies` of wix-utils, because the subpath imports them at runtime. They are vite-`external` in wix-utils, so they are not inlined. `@types/sanitize-html` and `vitest` are devDependencies. They are not peers, because consumers never import them directly. wix-stores and wix-stores-v1 add no new dependency: they already depend on wix-utils. They mark `@jay-framework/wix-utils/sanitize` as `external` in their vite config, so it resolves from wix-utils at runtime. The main wix-utils entry is still inlined, as before. **Server-only:** the client bundle (`dist/index.client.js`) of both store packages contains no `sanitize` reference, and the server bundle imports `@jay-framework/wix-utils/sanitize`. The main `wix-utils/dist/index.js` contains no `sanitize-html` (verified with grep after the build).
3. **`addNoopenerWhenTarget` is defined** as a `sanitizeHtml.Transformer`. If `attribs.target` is set, it returns the attributes with `rel` replaced by `noopener noreferrer`. Otherwise it returns them unchanged.
4. **QA route for the demo.** The planned route was the store product page `/products/<slug>` on a testbed copy. The only fleet testbed (the forms QA site) does **not** have the Wix Stores app (a read-only `stores/v3/products/query` returned `REQUIRED_APP_NOT_INSTALLED`, and v1 returned 0 products). Installing Stores would be a dashboard change, which is not allowed, so no live product page was shown. See Deviations.
5. **The dropped-tags table matches `nonTextTags`.** The content of `script, style, textarea, option, noscript, iframe, object, embed` is removed. Every other disallowed tag (for example `svg`) is discarded and its text is kept. `htmlToPlainText` uses the same `NON_TEXT_TAGS` constant.

### Deviations
- **Demo:** the demo is a recorded browser page, not a live QA product. It renders the raw payload next to the output of the **built** `@jay-framework/wix-utils/sanitize`. The raw frame's script runs (its `document.title` becomes `XSS`), and the sanitized frame stays `(none)`. The page also shows the live run of the 25 related tests. Video: `wix-62-sanitize-20261123.webm` at the workspace root (not in the repo). The read-only real-product check is still open until a QA site with Wix Stores exists.
- **Package tests** call `productPage.slowlyRender` with a mocked `wix-apis` module. They are not fixture-file based, because the inputs are a single payload string. The contract enums are mocked the way the existing tests mock them.
- Extra tests beyond the plan: iframe content removed, `style` and `class` dropped, `rel` kept without a `target`, `javascript:` img + `onerror` together, and script content dropped from plain text.
- Missing descriptions now map to `''` instead of `undefined` (wix-stores `description`).
- No CHANGELOG exists in these packages, so there is no entry to add. No versions or ranges were changed.

### Results
- Red first: wix-utils (module missing), then wix-stores 2/2 and wix-stores-v1 2/2 failed on the raw payload (wiring temporarily reverted). After the change they pass.
- `yarn build`: ok. `yarn test`: **1362/1362** across the workspace (wix-utils 21/21, new store tests 2/2 + 2/2).
- `npm run validate` on all examples: no errors. Before the acknowledgement there were 2 `HTML-STRING-TRUST` warnings per product page. After it there are 0. The `RAW-HTML-SINK`, `INLINE-EVENT-HANDLER` and `JAVASCRIPT-URL` rules report nothing. The remaining warnings were already there.
- Built against the unreleased jay rule (synced from a local jay build). The released wix still needs the jay release that has the rule.

### Live check on a real Wix Stores QA site (2026-11-24)

`examples/store` (this branch) ran against a QA Stores site (visitor mode, catalog V3) with the product slug `qa-xss-product`. The example page does not bind `description`, so for the demo only I bound `{productPage.description}` in a div and listed it under `allow-html-string` (local edit, reverted, not committed). Recorded: `wix-62-live-product-20261124.webm` (workspace root).

- **Rendered HTML (SSR, from the real catalog):** `<p>QA description with an <a href="https://example.com" target="_blank" rel="noopener noreferrer">external link</a> and <span>bold</span>.</p>`. The link is kept with `target="_blank"` and `rel="noopener noreferrer"`. No `<script>`, no `on*` attributes.
- **Console:** no errors from the description. The only console error is `GET /ecom/v1/carts/current` answering 404, which is the cart indicator for a first-time visitor with no cart (unrelated to sanitization).
- **Bold:** the text is kept, but the emphasis is not. The catalog returns bold as a `<span>` with an inline style; the sanitizer strips `style`, so the page shows plain text. Possible follow-up: map the catalog's bold span to `<strong>` before sanitizing. No change made here.
- **Finding: Wix sanitizes upstream.** Creating the product through the Wix API with `<img onerror>`, `<script>`, inline `style` and a `javascript:` link returned them already stripped or converted to Ricos nodes (the `img` became an IMAGE node, `style` became a font-weight span, the `javascript:` link was dropped). A real Stores product therefore cannot carry the raw payload through the API, and **this live page does not prove that the sanitizer blocked a payload.** That proof stays in the unit tests (red then green above) and in `wix-62-sanitize-20261123.webm`. The live run shows only that real catalog HTML passes through the sanitizing plugin intact (link) and unharmed.

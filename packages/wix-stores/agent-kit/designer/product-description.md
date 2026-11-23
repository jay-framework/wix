# Product description HTML

`description` and `infoSections.plainDescription` on the product page are `html-string`: they render as HTML.
They hold merchant-authored catalog HTML, which is external input. **The plugin sanitizes them on the server in the slow phase**, before they reach the page:

- Kept: `p, br, strong, em, b, i, u, s, ul, ol, li, h1-h6, a, span, div, img, blockquote`.
- Links keep `href` (`http`, `https`, `mailto` or relative), `target` and `rel`. A link with a `target` always gets `rel="noopener noreferrer"`.
- Images keep `src` (`http`/`https` or relative only, no `data:`), `alt`, `width` and `height`.
- Removed: every other tag, all `on*` handlers, `style`, `class`, `javascript:`/`data:`/protocol-relative URLs. The content of `script, style, textarea, option, noscript, iframe, object, embed` is removed too.
- The SEO `<meta name="description">` is plain text.

Style the description with CSS on its container (for example `.description p { … }`). Do not rely on inline styles or classes from the merchant.

## Acknowledging `HTML-STRING-TRUST`

`jay-stack validate` warns `HTML-STRING-TRUST` on every `html-string` binding. These two are already sanitized, so acknowledge them **once per page** in the page's validation script. Use your own headless key (here `productPage`):

```html
<script type="application/jay-validations">
    jay-stack:
        allow-html-string:
            - "productPage.description" # sanitized at source by wix-stores
            - "productPage.infoSections.plainDescription" # sanitized at source by wix-stores
</script>
```

List only these tags. **Never bind other user input to an `html-string` tag**: put it in a `string` tag, and Jay will escape it.

# Editing a product on the product page (source editing)

Product data on a `wix-stores/product-page` route lives in the **Wix Stores catalog**, not in jay-html. Change it there with the devOnly actions below.

## When to apply

The Target source is in a page that imports `wix-stores` `product-page` **and** either:

- it has `contentFromBinding`, or
- the element's `src` / text is a `{…}` binding into the product-page key, e.g. `{p.mediaGallery.selectedMedia.url}`, `{p.mediaGallery.availableMedia…media.url}`, `{p.productName}`, `{p.description}`.

| Bound field | What to change | Action |
| --- | --- | --- |
| `mediaGallery.selectedMedia.url` / `availableMedia[].media.url` | the product's main image | `updateProductMainImage` |
| `productName` | the product name | `updateProductText` (`name`) |
| `description` | the product description (HTML) | `updateProductText` (`plainDescription`) |

**Never hard-code the new image or text into jay-html.** The page renders every product; a literal `src` puts one product's image on all of them.

## Identity

The product is the route's **`slug`** param: the `[slug]` segment of the page URL (`/products/air-runner` → `air-runner`).

## Steps

Run from the project root.

1. Look up the product and confirm it with the user (name + current image):

   ```bash
   npx jay-stack-cli action wix-stores/getProductForEditing --input '{"slug":"air-runner"}'
   ```

2. Write the change:

   ```bash
   # main image — imageUrl: a public http(s) URL or a wix:image:// Media Manager URL
   npx jay-stack-cli action wix-stores/updateProductMainImage --input '{"slug":"air-runner","imageUrl":"https://example.com/red-sneaker.jpg"}'

   # name and/or description (plainDescription must be valid HTML)
   npx jay-stack-cli action wix-stores/updateProductText --input '{"slug":"air-runner","name":"Air Runner Pro"}'
   ```

   Optional on `updateProductMainImage`: `"altText":"…"`, `"keepPrevious":true`.

3. Refresh the page (workaround for Jay 0.25.5, whose dev server caches the slow render until a route file changes): touch the route's `page.jay-html` (mtime only, no content change):

   ```bash
   touch 'src/pages/products/[slug]/page.jay-html'
   ```

   The dev server clears its slow-render cache and reloads the page. If the old value still shows, restart the dev server.

4. The jay-html diff must be empty.

## No image URL?

Ask the user for a public image URL. If `wix-media` is installed, you can instead pick an existing Media Manager image from its agent-kit index and pass its `wix:image://…` URL. Don't generate images, and don't pass a local file path.

## Caveats

- By default the old main image is **removed** from the gallery. If a product option choice (e.g. a color) links to that image, the link is lost. Pass `"keepPrevious":true` to keep the old image as the second gallery item.
- Errors: `MISSING_PRODUCT_IDENTITY` (pass `slug` or `productId`), `PRODUCT_NOT_FOUND` (check the slug), `INVALID_IMAGE_URL` (ask for a URL), `WRITE_NOT_AUTHORIZED` (writes need `apiKeyStrategy` in `config/.wix.yaml` with an API key that has the Wix Stores *Manage Products* permission; tell the user, don't work around it).
- These actions exist on the dev server only. They write to the live Wix catalog.

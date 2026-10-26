# Editing products shown as cards (source editing)

Product cards rendered by `wix-stores` `product-search`, `category-products` and `product-spotlight` read their data from the **Wix Stores catalog**, not from jay-html. Change it there with the devOnly actions below. The write path is the same as on the product page (`wix-stores-editing-product-page.md`); only how you identify the product differs.

## When to apply

The Target source is inside one of these contracts **and** either:

- it has `contentFromBinding`, or
- the element's `src` / text is a `{…}` binding into a product card, e.g. `{mainMedia.url}` or `{name}` inside a `forEach` over `products`, or `{s.product.mainMedia.url}` for a spotlight.

| Bound card field | What to change           | Action                              |
| ---------------- | ------------------------ | ----------------------------------- |
| `mainMedia.url`  | the product's main image | `updateProductImage` (no `mediaId`) |
| `name`           | the product name         | `updateProductText` (`name`)        |

**Never hard-code the new image or text into jay-html.** The card template renders every product in the list.

## Identity

| Contract                              | Read the product from                                                                                 | Pass as     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| `product-search`, `category-products` | the enclosing `forEach` frame's **`itemId`** (the list is `trackBy: _id`, so it is the product `_id`) | `productId` |
| `product-spotlight`                   | the region's **`slug`** prop                                                                          | `slug`      |

## Steps

Run from the project root.

1. Look up the product and confirm it with the user (name + current image):

   ```bash
   npx jay-stack-cli action wix-stores/getProductForEditing --input '{"productId":"<itemId>"}'
   ```

2. Write the change:

   ```bash
   # main image from an attached file — imageFile: the attachment path from the prompt
   npx jay-stack-cli action wix-stores/updateProductImage --input '{"productId":"<itemId>","imageFile":"/abs/path/from/prompt/photo.jpg"}'

   # or from a URL — imageUrl: a public http(s) URL or a wix:image:// Media Manager URL
   npx jay-stack-cli action wix-stores/updateProductImage --input '{"productId":"<itemId>","imageUrl":"https://example.com/red-sneaker.jpg"}'

   # name
   npx jay-stack-cli action wix-stores/updateProductText --input '{"productId":"<itemId>","name":"Air Runner Pro"}'
   ```

   For a spotlight, pass `"slug":"<slug prop>"` instead of `productId`. Pass exactly one of `imageFile` / `imageUrl`; a card shows the main image, so omit `mediaId`. Optional: `"altText":"…"`, `"keepPrevious":true`. An attached file is uploaded to the Media Manager folder `media` — **don't copy it into `public/`**.

3. Refresh the page (workaround for Jay 0.25.5, whose dev server caches the slow render until a route file changes): touch the `page.jay-html` of the route the comment was made on (mtime only, no content change), e.g.:

   ```bash
   touch src/pages/products/page.jay-html
   ```

   The dev server clears its slow-render cache and reloads the page. If the old value still shows, restart the dev server.

4. The jay-html diff must be empty.

## No image?

If the user attached a file, use `imageFile` with its path. Otherwise ask for an image (attachment or public URL). If `wix-media` is installed, you can instead pick an existing Media Manager image from its agent-kit index and pass its `wix:image://…` URL. Don't generate images.

## Caveats

- By default the old main image is **removed** from the product's gallery. If a product option choice (e.g. a color) links to that image, the link is lost. Pass `"keepPrevious":true` to keep the old image as the second gallery item.
- Errors: `MISSING_PRODUCT_IDENTITY` (pass `slug` or `productId`), `PRODUCT_NOT_FOUND` (check the id/slug), `IMAGE_SOURCE_REQUIRED` (exactly one of `imageFile`/`imageUrl`), `INVALID_IMAGE_URL`, `FILE_NOT_FOUND` / `UNSUPPORTED_FILE_TYPE` / `FILE_TOO_LARGE` (jpg/jpeg/png/webp/gif, ≤ 10 MB), `MEDIA_UPLOAD_NOT_AUTHORIZED` (the API key needs Media Manager upload permission; tell the user), `WRITE_NOT_AUTHORIZED` (writes need `apiKeyStrategy` in `config/.wix.yaml` with an API key that has the Wix Stores _Manage Products_ permission; tell the user, don't work around it).
- Categories (`category-list`) are read-only for source editing.
- These actions exist on the dev server only. They write to the live Wix catalog.

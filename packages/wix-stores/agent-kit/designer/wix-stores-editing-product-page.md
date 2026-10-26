# Editing a product on the product page (source editing)

Product data on a `wix-stores/product-page` route lives in the **Wix Stores catalog**, not in jay-html. Change it there with the devOnly actions below.

## When to apply

The Target source is in a page that imports `wix-stores` `product-page` **and** either:

- it has `contentFromBinding`, or
- the element's `src` / text is a `{…}` binding into the product-page key, e.g. `{p.mediaGallery.selectedMedia.url}`, `{p.mediaGallery.availableMedia…media.url}`, `{p.productName}`, `{p.description}`.

| Bound field                                        | What to change                                                           | Action                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `mediaGallery.selectedMedia.url` (the large image) | the gallery image **currently displayed** — not necessarily the main one | `updateProductImage` with `mediaId` (see _Which image?_)  |
| `availableMedia[].media.url` (a thumbnail)         | that gallery image                                                       | `updateProductImage` with `mediaId` = the forEach item id |
| `productName`                                      | the product name                                                         | `updateProductText` (`name`)                              |
| `description`                                      | the product description (HTML)                                           | `updateProductText` (`plainDescription`)                  |

**Never hard-code the new image or text into jay-html.** The page renders every product; a literal `src` puts one product's image on all of them.

## Which image? (`mediaId`)

The user may click a thumbnail before commenting, so the large image can show any gallery item.

- **Thumbnail** — the Target source line says `inside forEach … item "<id>"` (the `availableMedia` forEach, trackBy `mediaId`): pass that id as `mediaId`.
- **Large image** — the Target source line ends with `shows src "<url>"`. Run `getProductForEditing` and pick the `media.items[]` entry whose `id` appears in that URL (e.g. `https://static.wixstatic.com/media/c837a6_b2~mv2.jpg` → `c837a6_b2~mv2.jpg`) or whose `url` equals it. Pass it as `mediaId` — even when it is the first item.
- No `shows src`, or no item matches → ask the user which image they mean. Don't assume the main image.

The first item is the product's main image: replacing it changes the main image everywhere (cards, cart).

## Identity

The product is the route's **`slug`** param: the `[slug]` segment of the page URL (`/products/air-runner` → `air-runner`).

## Steps

Run from the project root.

1. Look up the product (name, description, media items with their ids):

   ```bash
   npx jay-stack-cli action wix-stores/getProductForEditing --input '{"slug":"air-runner"}'
   ```

2. Write the change:

   ```bash
   # the user attached an image ("replace this image") — imageFile: the attachment path from the prompt
   npx jay-stack-cli action wix-stores/updateProductImage --input '{"slug":"air-runner","mediaId":"c837a6_b2~mv2.jpg","imageFile":"/abs/path/from/prompt/photo.jpg"}'

   # or from a URL — imageUrl: a public http(s) URL or a wix:image:// Media Manager URL
   npx jay-stack-cli action wix-stores/updateProductImage --input '{"slug":"air-runner","mediaId":"c837a6_b2~mv2.jpg","imageUrl":"https://example.com/red-sneaker.jpg"}'

   # name and/or description (plainDescription must be valid HTML)
   npx jay-stack-cli action wix-stores/updateProductText --input '{"slug":"air-runner","name":"Air Runner Pro"}'
   ```

   Pass exactly one of `imageFile` / `imageUrl`. Omitting `mediaId` replaces the main (first) image. Optional: `"altText":"…"`, `"keepPrevious":true`. An attached file is uploaded to the Media Manager folder `media` — **don't copy it into `public/`**.

3. Refresh the page (workaround for Jay 0.25.5, whose dev server caches the slow render until a route file changes): touch the route's `page.jay-html` (mtime only, no content change):

   ```bash
   touch 'src/pages/products/[slug]/page.jay-html'
   ```

   The dev server clears its slow-render cache and reloads the page. If the old value still shows, restart the dev server.

4. The jay-html diff must be empty.

## No image?

If the user attached a file, use `imageFile` with its path. Otherwise ask for an image (attachment or public URL). If `wix-media` is installed, you can instead pick an existing Media Manager image from its agent-kit index and pass its `wix:image://…` URL. Don't generate images.

## Caveats

- By default the replaced image is **removed** from the gallery. If a product option choice (e.g. a color) links to that image, the link is lost. Pass `"keepPrevious":true` to keep it right after the new one.
- Errors: `MISSING_PRODUCT_IDENTITY` (pass `slug` or `productId`), `PRODUCT_NOT_FOUND` (check the slug), `MEDIA_ITEM_NOT_FOUND` (the message lists the product's media ids), `IMAGE_SOURCE_REQUIRED` (exactly one of `imageFile`/`imageUrl`), `INVALID_IMAGE_URL`, `FILE_NOT_FOUND` / `UNSUPPORTED_FILE_TYPE` (jpg, jpeg, png, webp, gif) / `FILE_TOO_LARGE` (≤ 10 MB), `MEDIA_UPLOAD_NOT_AUTHORIZED` (the API key needs Media Manager upload permission; tell the user), `MEDIA_UPLOAD_FAILED` / `MEDIA_FILE_NOT_READY` (retry once), `WRITE_NOT_AUTHORIZED` (writes need `apiKeyStrategy` in `config/.wix.yaml` with an API key that has the Wix Stores _Manage Products_ permission; tell the user, don't work around it).
- These actions exist on the dev server only. They write to the live Wix catalog.

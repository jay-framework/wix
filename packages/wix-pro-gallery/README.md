# @jay-framework/wix-pro-gallery

Wix Pro Gallery for Jay Stack. Loads a gallery created in the Wix Editor **live by gallery id**, and adds the navigation state shared by slideshow, slider and thumbnail layouts: current item, previous/next, autoplay and looping. All markup and layout belong to your template. See [design log 33](../../design-log/33%20-%20wix-pro-gallery.md).

## Setup

Requires `@jay-framework/wix-server-client`. There is no plugin configuration; the gallery id is a prop. Gallery reads work with visitor (OAuth) access.

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/wix-pro-gallery"
    contract="pro-gallery"
  ></script>
</head>
<body>
  <section>
    <jay:pro-gallery galleryId="66f6bc8b-…" autoplay="true" intervalMs="4000" loop="true">
      <div class="viewport">
        <div class="track" style="transform: translateX(calc({currentIndex} * -100%))">
          <div class="slide" forEach="items" trackBy="itemId" style="left: calc({index} * 100%)">
            <img src="{url}/v1/fill/w_980,h_544,al_c,q_85/{mediaId}" alt="{altText}" />
          </div>
        </div>
      </div>
      <button ref="previousButton" if="hasPrevious">‹</button>
      <button ref="nextButton" if="hasNext">›</button>
      <span>{currentPosition} / {itemCount}</span>
    </jay:pro-gallery>
  </section>
</body>
```

- **Where to find the gallery id:** the Pro Gallery dashboard, or the widget's app settings.
- **Placement:** keep `<jay:pro-gallery>` inside an element rather than as a direct child of `<body>`.

## Contract `pro-gallery`

| Tag                                                        | Phase            |                                                                                                                                              |
| ---------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `items[]`                                                  | fast+interactive | `itemId, index, title, description, altText, link, mediaType (IMAGE \| VIDEO), url, mediaId, width, height, isCurrent`, `selectButton` (ref) |
| `currentIndex`, `currentPosition`, `itemCount`, `hasItems` | fast+interactive | current item (0-based / 1-based) and count                                                                                                   |
| `hasPrevious`, `hasNext`, `isPlaying`                      | fast+interactive | navigation state                                                                                                                             |
| `previousButton`, `nextButton`, `playPauseButton`          | interactive      | refs (any element)                                                                                                                           |

**Props:**

| Prop         | Default    |     |
| ------------ | ---------- | --- |
| `galleryId`  | (required) |     |
| `autoplay`   | `false`    |     |
| `intervalMs` | `4000`     |     |
| `loop`       | `false`    |     |

**Autoplay behavior:**

- runs in the browser only
- restarts its countdown after manual navigation
- holds while the tab is hidden
- stops at the last item unless `loop` is set

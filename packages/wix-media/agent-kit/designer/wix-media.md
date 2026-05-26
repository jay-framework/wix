# Using Wix Media

How to use images, video, documents, and audio from Wix Media Manager in jay-html templates.

## Finding Media

See the generated `references/wix-media/MEDIA-INDEX.md` for all available media with ready-to-use URLs.
Look up media by slug, then use the URL from the table.

## Image URLs

### Basic usage

```html
<img src="https://static.wixstatic.com/media/{mediaId}" alt="description" />
```

### Transformed (recommended for performance)

URL format: `https://static.wixstatic.com/media/{mediaId}/v1/{mode}/{params}/file.{ext}`

#### Modes

- **fit** — scale to fit within dimensions, preserve aspect ratio (may add padding)
  `<img src="https://static.wixstatic.com/media/{mediaId}/v1/fit/w_800,h_600/file.jpg" alt="" />`
- **fill** — scale to fill dimensions exactly, crop from center
  `<img src="https://static.wixstatic.com/media/{mediaId}/v1/fill/w_800,h_600/file.jpg" alt="" />`
- **crop** — extract a rectangle at specific coordinates
  `<img src="https://static.wixstatic.com/media/{mediaId}/v1/crop/x_100,y_50,w_800,h_600/file.jpg" alt="" />`

#### Parameters

- `w_{width}` — target width (1–5000 px)
- `h_{height}` — target height (1–5000 px)
- `x_{x},y_{y}` — crop start position (crop mode only)
- `q_{quality}` — JPEG quality (1–100)

#### Output format (set via file extension)

- `file.jpg` — JPEG (photos)
- `file.webp` — WebP (modern, smaller)
- `file.png` — PNG (transparency)
- `file.gif` — GIF (animation)

#### Common sizes

- Thumbnail: `/v1/fill/w_100,h_100/file.jpg`
- Card: `/v1/fill/w_400,h_300/file.jpg`
- Hero: `/v1/fill/w_1920,h_600/file.jpg`
- Full width: `/v1/fit/w_1200,h_800/file.webp`

## Video

Use the media URL directly in `<video>` tags.
Poster image: append `/v1/fit/w_{w},h_{h}/file.jpg` to video mediaId.

## Documents

URL format: `https://static.wixstatic.com/ugd/{mediaId}`

## Audio

URL format: `https://static.wixstatic.com/mp3/{mediaId}`

## Limits

- Max dimension: 5000px per side
- WebP max: 16,383px per side
- Images are not upscaled beyond original size
- Transformations only work with public Wix-hosted media

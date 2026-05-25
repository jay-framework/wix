import type { MediaFileInfo } from './services/wix-media-service.js';

function formatDimensions(file: MediaFileInfo): string {
    if (file.width && file.height) {
        return `${file.width}x${file.height}`;
    }
    return '-';
}

function formatLabels(labels: string[]): string {
    return labels.length > 0 ? labels.join(', ') : '-';
}

function escapeMarkdownCell(value: string): string {
    return value.replace(/\|/g, '\\|');
}

export function generateMediaIndex(files: MediaFileInfo[]): string {
    const lines: string[] = [];

    lines.push('# Available Media');
    lines.push('');
    lines.push('| Folder | Slug | Display Name | Type | Dimensions | Labels | URL |');
    lines.push('| ------ | ---- | ------------ | ---- | ---------- | ------ | --- |');

    for (const file of files) {
        lines.push(
            `| ${escapeMarkdownCell(file.folderName)} | ${file.slug} | ${escapeMarkdownCell(file.displayName)} | ${file.mediaType} | ${formatDimensions(file)} | ${formatLabels(file.labels)} | ${file.url} |`,
        );
    }

    lines.push('');
    lines.push('## How to Use');
    lines.push('');
    lines.push('### By slug in templates');
    lines.push('');
    lines.push('Find the media by slug in the table above, use the URL in `src` attributes:');
    lines.push('```html');
    lines.push('<img src="URL_FROM_TABLE" alt="description" />');
    lines.push('```');
    lines.push('');
    lines.push('### Image Transformations');
    lines.push('');
    lines.push('URL format: `https://static.wixstatic.com/media/{mediaId}/v1/{mode}/{params}/file.{ext}`');
    lines.push('');
    lines.push('#### Modes');
    lines.push('');
    lines.push('**fit** — scale to fit within dimensions, preserve aspect ratio (may add padding)');
    lines.push('`/v1/fit/w_640,h_480/file.jpg`');
    lines.push('');
    lines.push('**fill** — scale to fill dimensions, crop from center if needed');
    lines.push('`/v1/fill/w_640,h_480/file.jpg`');
    lines.push('');
    lines.push('**crop** — extract a rectangle from the original image at specific coordinates');
    lines.push('`/v1/crop/x_100,y_50,w_800,h_600/file.jpg`');
    lines.push('');
    lines.push('#### Parameters');
    lines.push('');
    lines.push('- `w_{width}` — target width (1–5000 px)');
    lines.push('- `h_{height}` — target height (1–5000 px)');
    lines.push('- `x_{x},y_{y}` — crop origin (crop mode only)');
    lines.push('- `q_{quality}` — JPEG quality (1–100, default 90)');
    lines.push('');
    lines.push('#### Output formats');
    lines.push('');
    lines.push('Use the file extension to convert:');
    lines.push('');
    lines.push('- `file.jpg` — JPEG (photos, many colors)');
    lines.push('- `file.png` — PNG (transparency, simple graphics)');
    lines.push('- `file.webp` — WebP (modern, better compression)');
    lines.push('- `file.gif` — GIF (animation)');
    lines.push('');
    lines.push('#### Common sizes');
    lines.push('');
    lines.push('- Thumbnail: `/v1/fill/w_100,h_100/file.jpg`');
    lines.push('- Card image: `/v1/fill/w_400,h_300/file.jpg`');
    lines.push('- Hero: `/v1/fill/w_1920,h_600/file.jpg`');
    lines.push('- Full width fit: `/v1/fit/w_1200,h_800/file.webp`');
    lines.push('');
    lines.push('#### Limits');
    lines.push('');
    lines.push('- Max dimension: 5000px per side');
    lines.push('- WebP max: 16,383px per side');
    lines.push('- Images are not upscaled beyond original size');
    lines.push('- Only works with public Wix-hosted media (`static.wixstatic.com`)');
    lines.push('');

    return lines.join('\n');
}

export function generateInstructions(): string {
    const lines: string[] = [];

    lines.push('# Using Media in Jay Framework');
    lines.push('');
    lines.push('## Finding Media');
    lines.push('');
    lines.push('See MEDIA-INDEX.md for all available media with ready-to-use URLs.');
    lines.push('Look up media by slug, then use the URL from the table.');
    lines.push('');
    lines.push('## Image URLs');
    lines.push('');
    lines.push('### Basic usage');
    lines.push('');
    lines.push('```html');
    lines.push('<img src="https://static.wixstatic.com/media/{mediaId}" alt="description" />');
    lines.push('```');
    lines.push('');
    lines.push('### Transformed (recommended for performance)');
    lines.push('');
    lines.push('URL format: `/v1/{mode}/{params}/file.{ext}`');
    lines.push('');
    lines.push('#### Modes');
    lines.push('');
    lines.push('- **fit** — scale to fit within dimensions, preserve aspect ratio');
    lines.push('  `<img src="https://static.wixstatic.com/media/{mediaId}/v1/fit/w_800,h_600/file.jpg" alt="" />`');
    lines.push('- **fill** — scale to fill dimensions exactly, crop from center');
    lines.push('  `<img src="https://static.wixstatic.com/media/{mediaId}/v1/fill/w_800,h_600/file.jpg" alt="" />`');
    lines.push('- **crop** — extract a rectangle at specific coordinates');
    lines.push('  `<img src="https://static.wixstatic.com/media/{mediaId}/v1/crop/x_100,y_50,w_800,h_600/file.jpg" alt="" />`');
    lines.push('');
    lines.push('#### Parameters');
    lines.push('');
    lines.push('- `w_{width}` — target width (1–5000 px)');
    lines.push('- `h_{height}` — target height (1–5000 px)');
    lines.push('- `x_{x},y_{y}` — crop start position (crop mode only)');
    lines.push('- `q_{quality}` — JPEG quality (1–100)');
    lines.push('');
    lines.push('#### Output format (set via file extension)');
    lines.push('');
    lines.push('- `file.jpg` — JPEG (photos)');
    lines.push('- `file.webp` — WebP (modern, smaller)');
    lines.push('- `file.png` — PNG (transparency)');
    lines.push('- `file.gif` — GIF (animation)');
    lines.push('');
    lines.push('#### Common sizes');
    lines.push('');
    lines.push('- Thumbnail: `/v1/fill/w_100,h_100/file.jpg`');
    lines.push('- Card: `/v1/fill/w_400,h_300/file.jpg`');
    lines.push('- Hero: `/v1/fill/w_1920,h_600/file.jpg`');
    lines.push('- Full width: `/v1/fit/w_1200,h_800/file.webp`');
    lines.push('');
    lines.push('## Video');
    lines.push('');
    lines.push('Use the media URL directly in `<video>` tags.');
    lines.push('Poster image: append `/v1/fit/w_{w},h_{h}/file.jpg` to video mediaId.');
    lines.push('');
    lines.push('## Documents');
    lines.push('');
    lines.push('URL format: `https://static.wixstatic.com/ugd/{mediaId}`');
    lines.push('');
    lines.push('## Audio');
    lines.push('');
    lines.push('URL format: `https://static.wixstatic.com/mp3/{mediaId}`');
    lines.push('');
    lines.push('## Limits');
    lines.push('');
    lines.push('- Max dimension: 5000px per side');
    lines.push('- WebP max: 16,383px per side');
    lines.push('- Images are not upscaled beyond original size');
    lines.push('- Transformations only work with public Wix-hosted media');
    lines.push('');

    return lines.join('\n');
}

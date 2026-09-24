import type { MediaFileInfo } from '../services/wix-media-service.js';

const VISUAL_FILE_EXTENSION_RE = /\.(svg|png|jpe?g|gif|webp|bmp|ico)($|[?#])/i;

function hasVisualFileExtension(file: MediaFileInfo): boolean {
    return VISUAL_FILE_EXTENSION_RE.test(`${file.displayName} ${file.url}`);
}

function isDirectPreviewableUrl(file: MediaFileInfo): boolean {
    const type = file.mediaType.toLowerCase();
    if (type === 'image' || type === 'vector') return true;
    return hasVisualFileExtension(file);
}

/**
 * Add Menu chip preview URL.
 *
 * Wix Media Manager exposes `thumbnailUrl` on each file descriptor (poster for video,
 * preview for images, and often for documents). Prefer that for all media types.
 * Fall back to the asset `url` only when it is directly renderable in `<img>` (images, vectors, SVGs).
 */
export function managerThumbnailUrlForAddMenu(file: MediaFileInfo): string | undefined {
    const fromManager = file.thumbnailUrl?.trim();
    if (fromManager) return fromManager;

    const assetUrl = file.url.trim();
    if (!assetUrl || !isDirectPreviewableUrl(file)) return undefined;
    return assetUrl;
}

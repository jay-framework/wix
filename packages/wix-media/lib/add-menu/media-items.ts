/**
 * Generate Add Menu items for indexed Wix Media Manager files (Design Log #19 M19.2).
 */

import type { MediaFileInfo } from '../services/wix-media-service.js';

export interface MediaAddMenuItem {
    id: string;
    title: string;
    category: string;
    subCategory: string;
    pluginName: string;
    packageName: string;
    thumbnail?: string;
    prompt: string;
}

const CATEGORY = 'Media';

function subCategoryForMediaType(mediaType: string): string {
    switch (mediaType.toLowerCase()) {
        case 'image':
            return 'Images';
        case 'video':
            return 'Videos';
        case 'audio':
            return 'Audio';
        case 'document':
            return 'Documents';
        default:
            return 'Other';
    }
}

function uniqueItemId(slug: string, mediaId: string, usedIds: Set<string>): string {
    const base = slug.trim() || mediaId.slice(0, 8);
    let id = `wix-media:${base}`;
    let suffix = 2;
    while (usedIds.has(id)) {
        id = `wix-media:${base}-${suffix++}`;
    }
    usedIds.add(id);
    return id;
}

function formatDimensions(file: MediaFileInfo): string {
    if (file.width && file.height) {
        return `${file.width}×${file.height}`;
    }
    return '-';
}

function formatTitle(file: MediaFileInfo): string {
    const folder = file.folderName?.trim();
    if (folder && folder !== 'Media Root' && folder !== 'Unknown') {
        return `${folder} — ${file.displayName}`;
    }
    return file.displayName;
}

const VISUAL_FILE_EXTENSION_RE = /\.(svg|png|jpe?g|gif|webp|bmp|ico)($|[?#])/i;

function hasVisualFileExtension(file: MediaFileInfo): boolean {
    return VISUAL_FILE_EXTENSION_RE.test(`${file.displayName} ${file.url}`);
}

function isPreviewableVisualMedia(file: MediaFileInfo): boolean {
    const type = file.mediaType.toLowerCase();
    if (type === 'image' || type === 'vector') return true;
    return hasVisualFileExtension(file);
}

/** Preview URL for picker chips — raster images, vectors, and SVGs served from Wix CDN. */
export function thumbnailUrlForMedia(file: MediaFileInfo): string | undefined {
    const url = file.url.trim();
    if (!url || !isPreviewableVisualMedia(file)) return undefined;
    return url;
}

function buildMediaPrompt(file: MediaFileInfo): string {
    const labels = file.labels.length > 0 ? `Labels: ${file.labels.join(', ')}\n` : '';
    const folderLine =
        file.folderName && file.folderName !== 'Unknown' ? `Folder: ${file.folderName}\n` : '';

    return [
        'Use this Wix Media Manager asset in jay-html (do not copy to public/):',
        `URL: ${file.url}`,
        `Media id: ${file.id}`,
        `Slug: ${file.slug}`,
        `Type: ${file.mediaType} · ${formatDimensions(file)}`,
        folderLine.trimEnd(),
        labels.trimEnd(),
        'Full media index: agent-kit/references/wix-media/MEDIA-INDEX.md',
        'See agent-kit/designer/wix-media.md for fit/fill/crop transforms.',
    ]
        .filter((line) => line.length > 0)
        .join('\n');
}

export function buildMediaAddMenuItems(files: MediaFileInfo[]): MediaAddMenuItem[] {
    const usedIds = new Set<string>();

    return files.map((file) => {
        const thumbnail = thumbnailUrlForMedia(file);
        return {
            id: uniqueItemId(file.slug, file.id, usedIds),
            title: formatTitle(file),
            category: CATEGORY,
            subCategory: subCategoryForMediaType(file.mediaType),
            pluginName: 'wix-media',
            packageName: '@jay-framework/wix-media',
            ...(thumbnail ? { thumbnail } : {}),
            prompt: buildMediaPrompt(file),
        };
    });
}

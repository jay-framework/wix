/**
 * Builds the `media.itemsInfo.items` array for a "replace a product image" update (DL #38, DL #40).
 *
 * Wix sets `media.main` to the first item and overwrites the items array as a whole, so the
 * full list is re-sent: the new image at the replaced item's position, the rest by Media Manager id.
 */

import { ActionError } from '@jay-framework/fullstack-component';
import { parseWixMediaUrl } from '@jay-framework/wix-utils';
import type { ProductMediaItem, WritableProductMediaItem } from '../wix-apis/types.js';

export interface ReplaceImageOptions {
    /** Media item `_id` to replace; omitted → the main (first) item. */
    mediaId?: string;
    altText?: string;
    /** Keep the replaced image in the gallery, right after the new one. */
    keepPrevious?: boolean;
}

export function buildReplacedImageItems(
    existingItems: ProductMediaItem[],
    imageUrl: string,
    options: ReplaceImageOptions = {},
): WritableProductMediaItem[] {
    const index = indexOfReplacedItem(existingItems, options.mediaId);
    const before = existingItems.slice(0, index);
    const replaced = existingItems.slice(index, index + 1);
    const after = existingItems.slice(index + 1);
    return [
        ...before.map(toExistingItem),
        toNewItem(imageUrl, options.altText),
        ...(options.keepPrevious ? replaced : []).map(toExistingItem),
        ...after.map(toExistingItem),
    ];
}

/** Index of the item to replace: the one with `mediaId`, or the main (first) item. */
export function indexOfReplacedItem(existingItems: ProductMediaItem[], mediaId?: string): number {
    if (mediaId === undefined) return 0;
    const index = existingItems.findIndex((item) => item._id === mediaId);
    if (index < 0) throw mediaItemNotFound(existingItems, mediaId);
    return index;
}

function mediaItemNotFound(existingItems: ProductMediaItem[], mediaId: string): ActionError {
    const ids = existingItems.map((item) => item._id).filter(Boolean);
    return new ActionError(
        'MEDIA_ITEM_NOT_FOUND',
        `The product has no media item "${mediaId}". Its media item ids: ${ids.length ? ids.join(', ') : '(none)'}. Run getProductForEditing and pass one of them, or omit mediaId to replace the main image.`,
    );
}

/** An image can be set from a public http(s) URL or a `wix:image://` Media Manager URL. */
export function isSupportedImageUrl(imageUrl: string): boolean {
    return /^https?:\/\//.test(imageUrl) || parseWixMediaUrl(imageUrl)?.type === 'image';
}

function toNewItem(imageUrl: string, altText?: string): WritableProductMediaItem {
    const mediaManagerFile = parseWixMediaUrl(imageUrl);
    const source = mediaManagerFile ? { id: mediaManagerFile.mediaId } : { url: imageUrl };
    return withAltText(source, altText);
}

function toExistingItem(item: ProductMediaItem): WritableProductMediaItem {
    const source = item._id ? { id: item._id } : { url: item.url };
    return withAltText(source, item.altText);
}

function withAltText(
    item: WritableProductMediaItem,
    altText: string | undefined,
): WritableProductMediaItem {
    return altText ? { ...item, altText } : item;
}

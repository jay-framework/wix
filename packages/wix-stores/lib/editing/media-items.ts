/**
 * Builds the `media.itemsInfo.items` array for a "set main image" product update (DL #38).
 *
 * Wix sets `media.main` to the first item and overwrites the items array as a whole, so the
 * full list is re-sent: the new image first, then the existing items by Media Manager id.
 */

import { parseWixMediaUrl } from '@jay-framework/wix-utils';
import type { ProductMediaItem, WritableProductMediaItem } from '../wix-apis/types.js';

export interface MainImageOptions {
    altText?: string;
    /** Keep the previous main image in the gallery (prepend) instead of replacing it. */
    keepPrevious?: boolean;
}

export function buildMainImageItems(
    existingItems: ProductMediaItem[],
    imageUrl: string,
    options: MainImageOptions = {},
): WritableProductMediaItem[] {
    const keptItems = options.keepPrevious ? existingItems : existingItems.slice(1);
    return [toNewMainItem(imageUrl, options.altText), ...keptItems.map(toExistingItem)];
}

/** An image can be set from a public http(s) URL or a `wix:image://` Media Manager URL. */
export function isSupportedImageUrl(imageUrl: string): boolean {
    return /^https?:\/\//.test(imageUrl) || parseWixMediaUrl(imageUrl)?.type === 'image';
}

function toNewMainItem(imageUrl: string, altText?: string): WritableProductMediaItem {
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

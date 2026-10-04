import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

/** Item as returned by the Pro Gallery API (only the fields this package reads). */
export interface RawGalleryItem {
    id?: string;
    sortOrder?: number;
    title?: string;
    description?: string;
    type?: 'IMAGE' | 'VIDEO' | 'TEXT' | string;
    link?: { text?: string; url?: string; target?: string };
    image?: { imageInfo?: RawMediaInfo };
    video?: { type?: string; videoInfo?: RawMediaInfo & { posters?: RawMediaInfo[] } };
}

export interface RawMediaInfo {
    id?: string;
    url?: string;
    width?: number;
    height?: number;
    altText?: string;
    filename?: string;
}

export interface GetGalleryResponse {
    gallery?: { id?: string; totalItems?: number; items?: RawGalleryItem[] };
}

const PAGE_SIZE = 100;

/** All items of a gallery, following the API's offset paging. */
export async function getGalleryItems(
    client: WixClient,
    galleryId: string,
): Promise<RawGalleryItem[]> {
    const items: RawGalleryItem[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { gallery } = await wixFetch<GetGalleryResponse>(
            client,
            `/progallery/v2/galleries/${encodeURIComponent(galleryId)}?offset=${offset}&limit=${PAGE_SIZE}`,
            { method: 'GET' },
        );
        const page = gallery?.items ?? [];
        items.push(...page);
        if (page.length < PAGE_SIZE || items.length >= (gallery?.totalItems ?? 0)) return items;
    }
}

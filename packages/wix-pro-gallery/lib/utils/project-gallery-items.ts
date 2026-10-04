import type { RawGalleryItem, RawMediaInfo } from '../wix-apis/get-gallery.js';

/** A gallery item in contract shape, before per-render navigation state (isCurrent) is added. */
export interface GalleryItemView {
    itemId: string;
    index: number;
    title: string;
    description: string;
    altText: string;
    link: string;
    mediaType: 'IMAGE' | 'VIDEO';
    url: string;
    mediaId: string;
    width: number;
    height: number;
}

const MEDIA_ROOT = 'https://static.wixstatic.com/media/';

/** Base media URL without any transform, like wix-stores' formatWixMediaUrl. */
function baseUrl(info: RawMediaInfo | undefined): string {
    if (info?.url?.startsWith(MEDIA_ROOT))
        return MEDIA_ROOT + info.url.slice(MEDIA_ROOT.length).split('/')[0];
    if (info?.id) return MEDIA_ROOT + info.id;
    return '';
}

/**
 * Project Pro Gallery API items into contract items: ordered by sortOrder, media-less and text items dropped,
 * videos represented by their poster image.
 */
export function projectGalleryItems(raw: RawGalleryItem[]): GalleryItemView[] {
    return raw
        .filter((item) => item.id && (item.type === 'IMAGE' || item.type === 'VIDEO'))
        .map((item) => {
            const isVideo = item.type === 'VIDEO';
            const media = isVideo ? item.video?.videoInfo?.posters?.[0] : item.image?.imageInfo;
            return { item, media };
        })
        .filter(({ media }) => baseUrl(media))
        .sort((a, b) => (a.item.sortOrder ?? 0) - (b.item.sortOrder ?? 0))
        .map(({ item, media }, index) => ({
            itemId: item.id!,
            index,
            title: item.title ?? '',
            description: item.description ?? '',
            altText: media?.altText || item.title || '',
            link: item.link?.url ?? '',
            mediaType: item.type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
            url: baseUrl(media),
            mediaId: baseUrl(media).slice(MEDIA_ROOT.length),
            width: media?.width ?? 0,
            height: media?.height ?? 0,
        }));
}

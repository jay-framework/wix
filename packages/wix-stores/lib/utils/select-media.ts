import { patch, REPLACE } from '@jay-framework/json-patch';
import { MediaGalleryViewState, Selected } from '../contracts/media-gallery.jay-contract';

/**
 * Returns the gallery with the item `mediaId` selected (the first item when none matches). A product without
 * media has no item to select, so its gallery is returned unchanged.
 */
export function selectMedia(
    gallery: MediaGalleryViewState,
    mediaId: string | null | undefined,
): MediaGalleryViewState {
    const oldSelectedIndex = gallery.availableMedia.findIndex(
        (_) => _.selected === Selected.selected,
    );
    const newSelectedIndex = Math.max(
        0,
        gallery.availableMedia.findIndex((_) => _.mediaId === mediaId),
    );
    const newSelectedMedia = gallery.availableMedia[newSelectedIndex];
    if (!newSelectedMedia || oldSelectedIndex === newSelectedIndex) return gallery;
    return patch(gallery, [
        { op: REPLACE, path: ['selectedMedia'], value: newSelectedMedia.media },
        {
            op: REPLACE,
            path: ['availableMedia', oldSelectedIndex, 'selected'],
            value: Selected.notSelected,
        },
        {
            op: REPLACE,
            path: ['availableMedia', newSelectedIndex, 'selected'],
            value: Selected.selected,
        },
    ]);
}

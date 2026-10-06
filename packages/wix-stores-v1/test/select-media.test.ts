// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { MediaType } from '../lib/contracts/media.jay-contract';
import { MediaGalleryViewState, Selected } from '../lib/contracts/media-gallery.jay-contract';
import { selectMedia } from '../lib/utils/select-media.js';

// The contracts' enums, as `jay-cli definitions` generates them (vitest does not compile linked sub-contracts).
vi.mock('../lib/contracts/media.jay-contract', () => ({ MediaType: { IMAGE: 0, VIDEO: 1 } }));
vi.mock('../lib/contracts/media-gallery.jay-contract', () => ({
    Selected: { selected: 0, notSelected: 1 },
}));

const image = (url: string) => ({ url, mediaType: MediaType.IMAGE });

const gallery: MediaGalleryViewState = {
    selectedMedia: image('a.jpg'),
    availableMedia: [
        { mediaId: 'a', media: image('a.jpg'), selected: Selected.selected },
        { mediaId: 'b', media: image('b.jpg'), selected: Selected.notSelected },
    ],
};

describe('selectMedia', () => {
    it('selects the requested item and unselects the previous one', () => {
        const next = selectMedia(gallery, 'b');
        expect(next.selectedMedia).toEqual(image('b.jpg'));
        expect(next.availableMedia.map((_) => _.selected)).toEqual([
            Selected.notSelected,
            Selected.selected,
        ]);
    });

    it('keeps the gallery when the item is already selected, or no item matches the first one', () => {
        expect(selectMedia(gallery, 'a')).toBe(gallery);
        expect(selectMedia(gallery, null)).toBe(gallery);
    });

    it('keeps the gallery of a product without media', () => {
        const empty: MediaGalleryViewState = {
            selectedMedia: image(''),
            availableMedia: [],
        };
        expect(selectMedia(empty, null)).toBe(empty);
    });
});

import {HTMLElementCollectionProxy, JayContract} from "@jay-framework/runtime";
import {MediaViewState, MediaRefs, MediaRepeatedRefs} from "./media.jay-contract";

export enum Selected {
  selected,
  notSelected
}

export interface AvailableMediaOfMediaGalleryViewState {
  mediaId: string,
  media: MediaViewState,
  selected: Selected
}

export interface MediaGalleryViewState {
  selectedMedia: MediaViewState,
  availableMedia: Array<AvailableMediaOfMediaGalleryViewState>
}

export type MediaGallerySlowViewState = Pick<MediaGalleryViewState, 'selectedMedia'> & {
    availableMedia: Array<Pick<MediaGalleryViewState['availableMedia'][number], 'mediaId' | 'media'>>;
};

export type MediaGalleryFastViewState = {
    availableMedia: Array<Pick<MediaGalleryViewState['availableMedia'][number], 'mediaId' | 'selected'>>;
};

export type MediaGalleryInteractiveViewState = {
    availableMedia: Array<Pick<MediaGalleryViewState['availableMedia'][number], 'mediaId' | 'selected'>>;
};


export interface MediaGalleryRefs {
  selectedMedia: MediaRefs,
  availableMedia: {
    selected: HTMLElementCollectionProxy<AvailableMediaOfMediaGalleryViewState, HTMLImageElement | HTMLDivElement>,
    media: MediaRefs
  }
}


export interface MediaGalleryRepeatedRefs {
  selectedMedia: MediaRepeatedRefs,
  availableMedia: {
    selected: HTMLElementCollectionProxy<AvailableMediaOfMediaGalleryViewState, HTMLImageElement | HTMLDivElement>,
    media: MediaRepeatedRefs
  }
}

export type MediaGalleryContract = JayContract<MediaGalleryViewState, MediaGalleryRefs, MediaGallerySlowViewState, MediaGalleryFastViewState, MediaGalleryInteractiveViewState>
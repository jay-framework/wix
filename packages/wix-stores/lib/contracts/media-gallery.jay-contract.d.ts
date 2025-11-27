import {HTMLElementCollectionProxy, JayContract} from "@jay-framework/runtime";
import {MediaViewState, MediaRefs, MediaRepeatedRefs} from "./media.jay-contract";

export enum Selected {
  selected,
  notSelected
}

export interface MediaItemOfAvailableMediaOfMediaGalleryViewState {
  media: Array<MediaViewState>,
  selected: Selected
}

export interface AvailableMediaOfMediaGalleryViewState {
  mediaItems: Array<MediaItemOfAvailableMediaOfMediaGalleryViewState>
}

export interface MediaGalleryViewState {
  selectedMedia: MediaViewState,
  availableMedia: AvailableMediaOfMediaGalleryViewState
}

export type MediaGallerySlowViewState = Pick<MediaGalleryViewState, 'selectedMedia'> & {
    availableMedia: {
    mediaItems: Array<Pick<MediaGalleryViewState['availableMedia']['mediaItems'][number], 'media'>>;
};
};

export type MediaGalleryFastViewState = {
    availableMedia: {
    mediaItems: Array<Pick<MediaGalleryViewState['availableMedia']['mediaItems'][number], 'selected'>>;
};
};

export type MediaGalleryInteractiveViewState = {
    availableMedia: {
    mediaItems: Array<Pick<MediaGalleryViewState['availableMedia']['mediaItems'][number], 'selected'>>;
};
};


export interface MediaGalleryRefs {
  selectedMedia: MediaRefs,
  availableMedia: {
    mediaItems: {
      selected: HTMLElementCollectionProxy<MediaItemOfAvailableMediaOfMediaGalleryViewState, HTMLImageElement | HTMLDivElement>,
      media: MediaRepeatedRefs
    }
  }
}


export interface MediaGalleryRepeatedRefs {
  selectedMedia: MediaRepeatedRefs,
  availableMedia: {
    mediaItems: {
      selected: HTMLElementCollectionProxy<MediaItemOfAvailableMediaOfMediaGalleryViewState, HTMLImageElement | HTMLDivElement>,
      media: MediaRepeatedRefs
    }
  }
}

export type MediaGalleryContract = JayContract<MediaGalleryViewState, MediaGalleryRefs, MediaGallerySlowViewState, MediaGalleryFastViewState, MediaGalleryInteractiveViewState>
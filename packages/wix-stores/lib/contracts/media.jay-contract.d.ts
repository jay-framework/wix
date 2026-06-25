import {JayContract} from "@jay-framework/runtime";


export enum MediaType {
  IMAGE,
  VIDEO
}

export interface MediaViewState {
  url: string,
  mediaType: MediaType
}

export type MediaSlowViewState = Pick<MediaViewState, 'url' | 'mediaType'>;

export type MediaFastViewState = {};

export type MediaInteractiveViewState = {};

export interface MediaRefs {}

export interface MediaRepeatedRefs {}

export type MediaContract = JayContract<MediaViewState, MediaRefs, MediaSlowViewState, MediaFastViewState, MediaInteractiveViewState>

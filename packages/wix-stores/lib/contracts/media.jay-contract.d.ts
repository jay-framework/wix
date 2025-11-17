import {JayContract} from "@jay-framework/runtime";


export enum MediaType {
  IMAGE,
  VIDEO
}

export interface MediaViewState {
  url: string,
  mediaType: MediaType,
  thumbnail_50x50: string
}

export interface MediaRefs {}

export interface MediaRepeatedRefs {}

export type MediaContract = JayContract<MediaViewState, MediaRefs>
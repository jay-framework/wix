import {JayElement, RenderElement, HTMLElementProxy, RenderElementOptions, JayContract} from "@jay-framework/runtime";

import './page.css';

export interface BrowseFolderOfPageViewState {
  rowKey: string,
  name: string,
  childCountLabel: string,
  folderPathJson: string
}

export interface BrowseFileOfPageViewState {
  rowKey: string,
  title: string,
  showThumbnail: boolean,
  thumbnail: string,
  mediaType: string
}

export interface BrowseBreadcrumbOfPageViewState {
  rowKey: string,
  label: string,
  folderPathJson: string
}

export interface PageViewState {
  connectionMessage: string,
  connected: boolean,
  fileCount: number,
  statusMessage: string,
  statusTone: string,
  showStatusMessage: boolean,
  indexedTotalItems: number,
  indexMissing: boolean,
  browseFolderLabel: string,
  browseFolders: Array<BrowseFolderOfPageViewState>,
  browseFiles: Array<BrowseFileOfPageViewState>,
  browseBreadcrumbs: Array<BrowseBreadcrumbOfPageViewState>,
  showBrowseFolders: boolean,
  showBrowseFiles: boolean,
  showBrowseEmpty: boolean,
  newFolderName: string
}


export interface PageElementRefs {
  refreshStatusBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>,
  browseBreadcrumbsList: HTMLElementProxy<PageViewState, HTMLDivElement>,
  browseFoldersList: HTMLElementProxy<PageViewState, HTMLDivElement>,
  rebuildCatalogBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>,
  newFolderNameInput: HTMLElementProxy<PageViewState, HTMLInputElement>,
  createFolderBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>,
  uploadFileInput: HTMLElementProxy<PageViewState, HTMLInputElement>
}

export type PageSlowViewState = {};
export type PageFastViewState = PageViewState;
export type PageInteractiveViewState = PageViewState;

export type PageElement = JayElement<PageViewState, PageElementRefs>
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>
export type PageElementPreRender = [PageElementRefs, PageElementRender]
export type PageContract = JayContract<
    PageViewState,
    PageElementRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;


export declare function render(options?: RenderElementOptions): PageElementPreRender

import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";
import {ProductCardViewState, ProductCardRefs, ProductCardRepeatedRefs} from "./product-card.jay-contract";

export enum MediaType {
  IMAGE,
  VIDEO,
  AUDIO,
  DOCUMENT,
  ZIP
}

export interface MainMediaOfMediaOfCategoryPageViewState {
  _id: string,
  url: string,
  altText: string,
  mediaType: MediaType
}

export enum MediaType {
  IMAGE,
  VIDEO,
  AUDIO,
  DOCUMENT,
  ZIP
}

export interface ThumbnailOfItemOfMediaOfCategoryPageViewState {
  url: string,
  width: number,
  height: number,
  format: string
}

export interface ItemOfMediaOfCategoryPageViewState {
  _id: string,
  url: string,
  altText: string,
  title: string,
  mediaType: MediaType,
  thumbnail: ThumbnailOfItemOfMediaOfCategoryPageViewState
}

export interface MediaOfCategoryPageViewState {
  mainMedia: MainMediaOfMediaOfCategoryPageViewState,
  items: Array<ItemOfMediaOfCategoryPageViewState>
}

export interface BreadcrumbOfCategoryPageViewState {
  categoryId: string,
  categoryName: string,
  categorySlug: string
}

export interface CategoryPageViewState {
  _id: string,
  name: string,
  description: string,
  slug: string,
  visible: boolean,
  numberOfProducts: number,
  media: MediaOfCategoryPageViewState,
  breadcrumbs: Array<BreadcrumbOfCategoryPageViewState>,
  products: Array<ProductCardViewState>,
  loadedProducts: Array<ProductCardViewState>,
  hasMore: boolean,
  loadedCount: number,
  isLoading: boolean,
  hasProducts: boolean
}

export type CategoryPageSlowViewState = Pick<CategoryPageViewState, '_id' | 'name' | 'description' | 'slug' | 'visible' | 'numberOfProducts' | 'products'> & {
    media: {
    mainMedia: CategoryPageViewState['media']['mainMedia'];
    items: Array<Pick<CategoryPageViewState['media']['items'][number], '_id' | 'url' | 'altText' | 'title' | 'mediaType'> & {
    thumbnail: CategoryPageViewState['media']['items'][number]['thumbnail'];
}>;
};
    breadcrumbs: Array<CategoryPageViewState['breadcrumbs'][number]>;
};

export type CategoryPageFastViewState = Pick<CategoryPageViewState, 'loadedProducts' | 'hasMore' | 'loadedCount' | 'isLoading' | 'hasProducts'>;

export type CategoryPageInteractiveViewState = Pick<CategoryPageViewState, 'loadedProducts' | 'hasMore' | 'loadedCount' | 'isLoading' | 'hasProducts'>;


export interface CategoryPageRefs {
  loadMoreButton: HTMLElementProxy<CategoryPageViewState, HTMLButtonElement>,
  breadcrumbs: {
    categoryLink: HTMLElementCollectionProxy<BreadcrumbOfCategoryPageViewState, HTMLAnchorElement>
  },
  products: ProductCardRepeatedRefs,
  loadedProducts: ProductCardRepeatedRefs
}


export interface CategoryPageRepeatedRefs {
  loadMoreButton: HTMLElementCollectionProxy<CategoryPageViewState, HTMLButtonElement>,
  breadcrumbs: {
    categoryLink: HTMLElementCollectionProxy<BreadcrumbOfCategoryPageViewState, HTMLAnchorElement>
  },
  products: ProductCardRepeatedRefs,
  loadedProducts: ProductCardRepeatedRefs
}

export type CategoryPageContract = JayContract<CategoryPageViewState, CategoryPageRefs, CategoryPageSlowViewState, CategoryPageFastViewState, CategoryPageInteractiveViewState>
import {HTMLElementCollectionProxy, JayContract} from "@jay-framework/runtime";


export interface CategoryOfCategoryListViewState {
  _id: string,
  name: string,
  slug: string,
  description: string,
  productCount: number,
  imageUrl: string
}

export interface CategoryListViewState {
  categories: Array<CategoryOfCategoryListViewState>,
  hasCategories: boolean
}

export type CategoryListSlowViewState = Pick<CategoryListViewState, 'hasCategories'> & {
    categories: Array<CategoryListViewState['categories'][number]>;
};

export type CategoryListFastViewState = {};

export type CategoryListInteractiveViewState = {};


export interface CategoryListRefs {
  categories: {
    categoryLink: HTMLElementCollectionProxy<CategoryOfCategoryListViewState, HTMLAnchorElement>
  }
}


export interface CategoryListRepeatedRefs {
  categories: {
    categoryLink: HTMLElementCollectionProxy<CategoryOfCategoryListViewState, HTMLAnchorElement>
  }
}

export type CategoryListContract = JayContract<CategoryListViewState, CategoryListRefs, CategoryListSlowViewState, CategoryListFastViewState, CategoryListInteractiveViewState>
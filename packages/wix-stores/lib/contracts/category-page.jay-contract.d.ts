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
  id: string,
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
  id: string,
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

export interface PageNumberOfPaginationOfCategoryPageViewState {
  pageNumber: number,
  isCurrent: boolean
}

export interface PaginationOfCategoryPageViewState {
  currentPage: number,
  totalPages: number,
  totalProducts: number,
  pageNumbers: Array<PageNumberOfPaginationOfCategoryPageViewState>
}

export enum CurrentSort {
  newest,
  priceAsc,
  priceDesc,
  nameAsc,
  nameDesc
}

export interface SortByOfCategoryPageViewState {
  currentSort: CurrentSort
}

export interface PriceRangeOfFilterOfCategoryPageViewState {
  minPrice: number,
  maxPrice: number
}

export interface FilterOfCategoryPageViewState {
  priceRange: PriceRangeOfFilterOfCategoryPageViewState,
  inStockOnly: boolean
}

export interface CategoryPageViewState {
  id: string,
  name: string,
  description: string,
  slug: string,
  visible: boolean,
  numberOfProducts: number,
  media: MediaOfCategoryPageViewState,
  breadcrumbs: Array<BreadcrumbOfCategoryPageViewState>,
  products: Array<ProductCardViewState>,
  pagination: PaginationOfCategoryPageViewState,
  sortBy: SortByOfCategoryPageViewState,
  filters: FilterOfCategoryPageViewState,
  isLoading: boolean,
  hasProducts: boolean
}

export type CategoryPageSlowViewState = Pick<CategoryPageViewState, 'id' | 'name' | 'description' | 'slug' | 'visible' | 'numberOfProducts' | 'products' | 'isLoading' | 'hasProducts'> & {
    media: {
    mainMedia: CategoryPageViewState['media']['mainMedia'];
    items: Array<Pick<CategoryPageViewState['media']['items'][number], 'id' | 'url' | 'altText' | 'title' | 'mediaType'> & {
    thumbnail: CategoryPageViewState['media']['items']['thumbnail'];
}>;
};
    breadcrumbs: Array<CategoryPageViewState['breadcrumbs'][number]>;
    pagination: Pick<CategoryPageViewState['pagination'], 'currentPage' | 'totalPages' | 'totalProducts'> & {
    pageNumbers: Array<CategoryPageViewState['pagination']['pageNumbers'][number]>;
};
    sortBy: CategoryPageViewState['sortBy'];
};

export type CategoryPageFastViewState = {
    filters: Pick<CategoryPageViewState['filters'], 'inStockOnly'> & {
    priceRange: CategoryPageViewState['filters']['priceRange'];
};
};

export type CategoryPageInteractiveViewState = {
    filters: Pick<CategoryPageViewState['filters'], 'inStockOnly'> & {
    priceRange: CategoryPageViewState['filters']['priceRange'];
};
};


export interface CategoryPageRefs {
  breadcrumbs: {
    categoryLink: HTMLElementCollectionProxy<BreadcrumbOfCategoryPageViewState, HTMLAnchorElement>
  },
  products: ProductCardRepeatedRefs,
  pagination: {
    prevButton: HTMLElementProxy<PaginationOfCategoryPageViewState, HTMLButtonElement>,
    nextButton: HTMLElementProxy<PaginationOfCategoryPageViewState, HTMLButtonElement>,
    pageNumbers: {
      pageButton: HTMLElementCollectionProxy<PageNumberOfPaginationOfCategoryPageViewState, HTMLButtonElement>
    }
  },
  sortBy: {
    sortDropdown: HTMLElementProxy<SortByOfCategoryPageViewState, HTMLSelectElement>
  },
  filters: {
    inStockOnly: HTMLElementProxy<FilterOfCategoryPageViewState, HTMLInputElement>,
    clearFilters: HTMLElementProxy<FilterOfCategoryPageViewState, HTMLButtonElement>,
    priceRange: {
      minPrice: HTMLElementProxy<PriceRangeOfFilterOfCategoryPageViewState, HTMLInputElement>,
      maxPrice: HTMLElementProxy<PriceRangeOfFilterOfCategoryPageViewState, HTMLInputElement>,
      applyPriceFilter: HTMLElementProxy<PriceRangeOfFilterOfCategoryPageViewState, HTMLButtonElement>
    }
  }
}


export interface CategoryPageRepeatedRefs {
  breadcrumbs: {
    categoryLink: HTMLElementCollectionProxy<BreadcrumbOfCategoryPageViewState, HTMLAnchorElement>
  },
  products: ProductCardRepeatedRefs,
  pagination: {
    prevButton: HTMLElementCollectionProxy<PaginationOfCategoryPageViewState, HTMLButtonElement>,
    nextButton: HTMLElementCollectionProxy<PaginationOfCategoryPageViewState, HTMLButtonElement>,
    pageNumbers: {
      pageButton: HTMLElementCollectionProxy<PageNumberOfPaginationOfCategoryPageViewState, HTMLButtonElement>
    }
  },
  sortBy: {
    sortDropdown: HTMLElementCollectionProxy<SortByOfCategoryPageViewState, HTMLSelectElement>
  },
  filters: {
    inStockOnly: HTMLElementCollectionProxy<FilterOfCategoryPageViewState, HTMLInputElement>,
    clearFilters: HTMLElementCollectionProxy<FilterOfCategoryPageViewState, HTMLButtonElement>,
    priceRange: {
      minPrice: HTMLElementCollectionProxy<PriceRangeOfFilterOfCategoryPageViewState, HTMLInputElement>,
      maxPrice: HTMLElementCollectionProxy<PriceRangeOfFilterOfCategoryPageViewState, HTMLInputElement>,
      applyPriceFilter: HTMLElementCollectionProxy<PriceRangeOfFilterOfCategoryPageViewState, HTMLButtonElement>
    }
  }
}

export type CategoryPageContract = JayContract<CategoryPageViewState, CategoryPageRefs, CategoryPageSlowViewState, CategoryPageFastViewState, CategoryPageInteractiveViewState>
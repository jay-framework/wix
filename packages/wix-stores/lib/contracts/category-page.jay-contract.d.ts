import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";
import {ProductCardViewState, ProductCardRefs, ProductCardRepeatedRefs} from "./product-card.jay-contract";

export interface BreadcrumbOfCategoryPageViewState {
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
  categoryId: string,
  categoryName: string,
  categoryDescription: string,
  categoryImage: string,
  breadcrumbs: Array<BreadcrumbOfCategoryPageViewState>,
  products: Array<ProductCardViewState>,
  pagination: PaginationOfCategoryPageViewState,
  sortBy: SortByOfCategoryPageViewState,
  filters: FilterOfCategoryPageViewState,
  isLoading: boolean,
  hasProducts: boolean
}


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

export type CategoryPageContract = JayContract<CategoryPageViewState, CategoryPageRefs>
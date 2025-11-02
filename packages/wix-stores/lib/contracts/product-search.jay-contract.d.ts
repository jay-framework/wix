import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";
import {ProductCardViewState, ProductCardRefs, ProductCardRepeatedRefs} from "./product-card.jay-contract";

export interface PriceRangeOfFilterOfProductSearchViewState {
  minPrice: number,
  maxPrice: number
}

export interface CategoryOfCategoryFilterOfFilterOfProductSearchViewState {
  categoryId: string,
  categoryName: string,
  isSelected: boolean
}

export interface CategoryFilterOfFilterOfProductSearchViewState {
  categories: Array<CategoryOfCategoryFilterOfFilterOfProductSearchViewState>
}

export interface FilterOfProductSearchViewState {
  priceRange: PriceRangeOfFilterOfProductSearchViewState,
  categoryFilter: CategoryFilterOfFilterOfProductSearchViewState,
  inStockOnly: boolean
}

export enum CurrentSort {
  relevance,
  priceAsc,
  priceDesc,
  newest,
  nameAsc,
  nameDesc
}

export interface SortByOfProductSearchViewState {
  currentSort: CurrentSort
}

export interface PaginationOfProductSearchViewState {
  currentPage: number,
  totalPages: number,
  hasNextPage: boolean,
  hasPrevPage: boolean
}

export interface SuggestionOfProductSearchViewState {
  suggestionText: string
}

export interface ProductSearchViewState {
  searchQuery: string,
  isSearching: boolean,
  hasSearched: boolean,
  searchResults: Array<ProductCardViewState>,
  resultCount: number,
  hasResults: boolean,
  emptyStateMessage: string,
  filters: FilterOfProductSearchViewState,
  sortBy: SortByOfProductSearchViewState,
  pagination: PaginationOfProductSearchViewState,
  hasSuggestions: boolean,
  suggestions: Array<SuggestionOfProductSearchViewState>
}


export interface ProductSearchRefs {
  searchQuery: HTMLElementProxy<ProductSearchViewState, HTMLInputElement>,
  searchButton: HTMLElementProxy<ProductSearchViewState, HTMLButtonElement>,
  clearSearchButton: HTMLElementProxy<ProductSearchViewState, HTMLButtonElement>,
  searchResults: ProductCardRepeatedRefs,
  filters: {
    inStockOnly: HTMLElementProxy<FilterOfProductSearchViewState, HTMLInputElement>,
    applyFilters: HTMLElementProxy<FilterOfProductSearchViewState, HTMLButtonElement>,
    clearFilters: HTMLElementProxy<FilterOfProductSearchViewState, HTMLButtonElement>,
    priceRange: {
      minPrice: HTMLElementProxy<PriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>,
      maxPrice: HTMLElementProxy<PriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>
    },
    categoryFilter: {
      categories: {
        isSelected: HTMLElementCollectionProxy<CategoryOfCategoryFilterOfFilterOfProductSearchViewState, HTMLInputElement>
      }
    }
  },
  sortBy: {
    sortDropdown: HTMLElementProxy<SortByOfProductSearchViewState, HTMLSelectElement>
  },
  pagination: {
    prevButton: HTMLElementProxy<PaginationOfProductSearchViewState, HTMLButtonElement>,
    nextButton: HTMLElementProxy<PaginationOfProductSearchViewState, HTMLButtonElement>,
    loadMoreButton: HTMLElementProxy<PaginationOfProductSearchViewState, HTMLButtonElement>
  },
  suggestions: {
    suggestionButton: HTMLElementCollectionProxy<SuggestionOfProductSearchViewState, HTMLButtonElement>
  }
}


export interface ProductSearchRepeatedRefs {
  searchQuery: HTMLElementCollectionProxy<ProductSearchViewState, HTMLInputElement>,
  searchButton: HTMLElementCollectionProxy<ProductSearchViewState, HTMLButtonElement>,
  clearSearchButton: HTMLElementCollectionProxy<ProductSearchViewState, HTMLButtonElement>,
  searchResults: ProductCardRepeatedRefs,
  filters: {
    inStockOnly: HTMLElementCollectionProxy<FilterOfProductSearchViewState, HTMLInputElement>,
    applyFilters: HTMLElementCollectionProxy<FilterOfProductSearchViewState, HTMLButtonElement>,
    clearFilters: HTMLElementCollectionProxy<FilterOfProductSearchViewState, HTMLButtonElement>,
    priceRange: {
      minPrice: HTMLElementCollectionProxy<PriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>,
      maxPrice: HTMLElementCollectionProxy<PriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>
    },
    categoryFilter: {
      categories: {
        isSelected: HTMLElementCollectionProxy<CategoryOfCategoryFilterOfFilterOfProductSearchViewState, HTMLInputElement>
      }
    }
  },
  sortBy: {
    sortDropdown: HTMLElementCollectionProxy<SortByOfProductSearchViewState, HTMLSelectElement>
  },
  pagination: {
    prevButton: HTMLElementCollectionProxy<PaginationOfProductSearchViewState, HTMLButtonElement>,
    nextButton: HTMLElementCollectionProxy<PaginationOfProductSearchViewState, HTMLButtonElement>,
    loadMoreButton: HTMLElementCollectionProxy<PaginationOfProductSearchViewState, HTMLButtonElement>
  },
  suggestions: {
    suggestionButton: HTMLElementCollectionProxy<SuggestionOfProductSearchViewState, HTMLButtonElement>
  }
}

export type ProductSearchContract = JayContract<ProductSearchViewState, ProductSearchRefs>
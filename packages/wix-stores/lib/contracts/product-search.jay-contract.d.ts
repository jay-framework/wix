import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";
import {ProductCardViewState, ProductCardRefs, ProductCardRepeatedRefs} from "./product-card.jay-contract";

export interface RangeOfPriceRangeOfFilterOfProductSearchViewState {
  rangeId: string,
  label: string,
  minValue: number,
  maxValue: number,
  productCount: number,
  isSelected: boolean
}

export interface PriceRangeOfFilterOfProductSearchViewState {
  minPrice: number,
  maxPrice: number,
  minBound: number,
  maxBound: number,
  ranges: Array<RangeOfPriceRangeOfFilterOfProductSearchViewState>
}

export interface CategoryOfCategoryFilterOfFilterOfProductSearchViewState {
  categoryId: string,
  categoryName: string,
  categorySlug: string,
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

export interface SuggestionOfProductSearchViewState {
  suggestionId: string,
  suggestionText: string
}

export interface ProductSearchViewState {
  searchExpression: string,
  searchFields: string,
  fuzzySearch: boolean,
  isSearching: boolean,
  hasSearched: boolean,
  searchResults: Array<ProductCardViewState>,
  resultCount: number,
  hasResults: boolean,
  emptyStateMessage: string,
  filters: FilterOfProductSearchViewState,
  sortBy: SortByOfProductSearchViewState,
  hasMore: boolean,
  loadedCount: number,
  totalCount: number,
  hasSuggestions: boolean,
  suggestions: Array<SuggestionOfProductSearchViewState>
}

export type ProductSearchSlowViewState = Pick<ProductSearchViewState, 'searchFields' | 'fuzzySearch' | 'emptyStateMessage'> & {
    filters: {
    categoryFilter: {
    categories: Array<Pick<ProductSearchViewState['filters']['categoryFilter']['categories'][number], 'categoryId' | 'categoryName' | 'categorySlug'>>;
};
};
};

export type ProductSearchFastViewState = Pick<ProductSearchViewState, 'searchExpression' | 'isSearching' | 'hasSearched' | 'searchResults' | 'resultCount' | 'hasResults' | 'hasMore' | 'loadedCount' | 'totalCount' | 'hasSuggestions'> & {
    filters: Pick<ProductSearchViewState['filters'], 'inStockOnly'> & {
    priceRange: Pick<ProductSearchViewState['filters']['priceRange'], 'minPrice' | 'maxPrice' | 'minBound' | 'maxBound'> & {
    ranges: Array<ProductSearchViewState['filters']['priceRange']['ranges'][number]>;
};
    categoryFilter: {
    categories: Array<Pick<ProductSearchViewState['filters']['categoryFilter']['categories'][number], 'categoryId' | 'isSelected'>>;
};
};
    sortBy: ProductSearchViewState['sortBy'];
    suggestions: Array<ProductSearchViewState['suggestions'][number]>;
};

export type ProductSearchInteractiveViewState = Pick<ProductSearchViewState, 'searchExpression' | 'isSearching' | 'hasSearched' | 'searchResults' | 'resultCount' | 'hasResults' | 'hasMore' | 'loadedCount' | 'totalCount' | 'hasSuggestions'> & {
    filters: Pick<ProductSearchViewState['filters'], 'inStockOnly'> & {
    priceRange: Pick<ProductSearchViewState['filters']['priceRange'], 'minPrice' | 'maxPrice' | 'minBound' | 'maxBound'> & {
    ranges: Array<ProductSearchViewState['filters']['priceRange']['ranges'][number]>;
};
    categoryFilter: {
    categories: Array<Pick<ProductSearchViewState['filters']['categoryFilter']['categories'][number], 'categoryId' | 'isSelected'>>;
};
};
    sortBy: ProductSearchViewState['sortBy'];
    suggestions: Array<ProductSearchViewState['suggestions'][number]>;
};


export interface ProductSearchRefs {
  searchExpression: HTMLElementProxy<ProductSearchViewState, HTMLInputElement>,
  searchButton: HTMLElementProxy<ProductSearchViewState, HTMLButtonElement>,
  clearSearchButton: HTMLElementProxy<ProductSearchViewState, HTMLButtonElement>,
  loadMoreButton: HTMLElementProxy<ProductSearchViewState, HTMLButtonElement>,
  searchResults: ProductCardRepeatedRefs,
  filters: {
    inStockOnly: HTMLElementProxy<FilterOfProductSearchViewState, HTMLInputElement>,
    clearFilters: HTMLElementProxy<FilterOfProductSearchViewState, HTMLButtonElement>,
    priceRange: {
      minPrice: HTMLElementProxy<PriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>,
      maxPrice: HTMLElementProxy<PriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>,
      ranges: {
        isSelected: HTMLElementCollectionProxy<RangeOfPriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>
      }
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
  suggestions: {
    suggestionButton: HTMLElementCollectionProxy<SuggestionOfProductSearchViewState, HTMLButtonElement>
  }
}


export interface ProductSearchRepeatedRefs {
  searchExpression: HTMLElementCollectionProxy<ProductSearchViewState, HTMLInputElement>,
  searchButton: HTMLElementCollectionProxy<ProductSearchViewState, HTMLButtonElement>,
  clearSearchButton: HTMLElementCollectionProxy<ProductSearchViewState, HTMLButtonElement>,
  loadMoreButton: HTMLElementCollectionProxy<ProductSearchViewState, HTMLButtonElement>,
  searchResults: ProductCardRepeatedRefs,
  filters: {
    inStockOnly: HTMLElementCollectionProxy<FilterOfProductSearchViewState, HTMLInputElement>,
    clearFilters: HTMLElementCollectionProxy<FilterOfProductSearchViewState, HTMLButtonElement>,
    priceRange: {
      minPrice: HTMLElementCollectionProxy<PriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>,
      maxPrice: HTMLElementCollectionProxy<PriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>,
      ranges: {
        isSelected: HTMLElementCollectionProxy<RangeOfPriceRangeOfFilterOfProductSearchViewState, HTMLInputElement>
      }
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
  suggestions: {
    suggestionButton: HTMLElementCollectionProxy<SuggestionOfProductSearchViewState, HTMLButtonElement>
  }
}

export type ProductSearchContract = JayContract<ProductSearchViewState, ProductSearchRefs, ProductSearchSlowViewState, ProductSearchFastViewState, ProductSearchInteractiveViewState>
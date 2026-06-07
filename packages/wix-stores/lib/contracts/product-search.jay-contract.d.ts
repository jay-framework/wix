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
  isSelected: boolean,
  categoryUrl: string
}

export interface CategoryFilterOfFilterOfProductSearchViewState {
  categories: Array<CategoryOfCategoryFilterOfFilterOfProductSearchViewState>
}

export enum OptionRenderType {
  TEXT_CHOICES,
  SWATCH_CHOICES
}

export interface ChoiceOfOptionFilterOfFilterOfProductSearchViewState {
  choiceId: string,
  choiceName: string,
  colorCode: string,
  productCount: number,
  isSelected: boolean,
  isDisabled: boolean
}

export interface OptionFilterOfFilterOfProductSearchViewState {
  optionId: string,
  optionName: string,
  optionRenderType: OptionRenderType,
  choices: Array<ChoiceOfOptionFilterOfFilterOfProductSearchViewState>
}

export interface FilterOfProductSearchViewState {
  priceRange: PriceRangeOfFilterOfProductSearchViewState,
  categoryFilter: CategoryFilterOfFilterOfProductSearchViewState,
  inStockOnly: boolean,
  optionFilters: Array<OptionFilterOfFilterOfProductSearchViewState>
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

export interface BreadcrumbOfCategoryHeaderOfProductSearchViewState {
  categoryId: string,
  name: string,
  slug: string,
  url: string
}

export interface PropOfTagOfSeoDatumOfCategoryHeaderOfProductSearchViewState {
  key: string,
  value: string
}

export interface MetaOfTagOfSeoDatumOfCategoryHeaderOfProductSearchViewState {
  key: string,
  value: string
}

export interface TagOfSeoDatumOfCategoryHeaderOfProductSearchViewState {
  position: string,
  type: string,
  props: Array<PropOfTagOfSeoDatumOfCategoryHeaderOfProductSearchViewState>,
  meta: Array<MetaOfTagOfSeoDatumOfCategoryHeaderOfProductSearchViewState>,
  children: string
}

export interface KeywordOfSettingOfSeoDatumOfCategoryHeaderOfProductSearchViewState {
  term: string,
  isMain: boolean,
  origin: string
}

export interface SettingOfSeoDatumOfCategoryHeaderOfProductSearchViewState {
  preventAutoRedirect: boolean,
  keywords: Array<KeywordOfSettingOfSeoDatumOfCategoryHeaderOfProductSearchViewState>
}

export interface SeoDatumOfCategoryHeaderOfProductSearchViewState {
  tags: Array<TagOfSeoDatumOfCategoryHeaderOfProductSearchViewState>,
  settings: SettingOfSeoDatumOfCategoryHeaderOfProductSearchViewState
}

export interface CategoryHeaderOfProductSearchViewState {
  name: string,
  description: string,
  imageUrl: string,
  hasImage: boolean,
  productCount: number,
  breadcrumbs: Array<BreadcrumbOfCategoryHeaderOfProductSearchViewState>,
  seoData: SeoDatumOfCategoryHeaderOfProductSearchViewState
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
  suggestions: Array<SuggestionOfProductSearchViewState>,
  categoryHeader: CategoryHeaderOfProductSearchViewState
}

export type ProductSearchSlowViewState = Pick<ProductSearchViewState, 'searchFields' | 'fuzzySearch' | 'emptyStateMessage'> & {
    filters: {
    categoryFilter: {
    categories: Array<Pick<ProductSearchViewState['filters']['categoryFilter']['categories'][number], 'categoryId' | 'categoryName' | 'categorySlug' | 'categoryUrl'>>;
};
};
    categoryHeader: ProductSearchViewState['categoryHeader'];
};

export type ProductSearchFastViewState = Pick<ProductSearchViewState, 'searchExpression' | 'isSearching' | 'hasSearched' | 'resultCount' | 'hasResults' | 'hasMore' | 'loadedCount' | 'totalCount' | 'hasSuggestions'> & {
    searchResults: Array<ProductSearchViewState['searchResults'][number]>;
    filters: Pick<ProductSearchViewState['filters'], 'inStockOnly'> & {
    priceRange: ProductSearchViewState['filters']['priceRange'];
    categoryFilter: {
    categories: Array<Pick<ProductSearchViewState['filters']['categoryFilter']['categories'][number], 'categoryId' | 'isSelected'>>;
};
    optionFilters: Array<ProductSearchViewState['filters']['optionFilters'][number]>;
};
    sortBy: ProductSearchViewState['sortBy'];
    suggestions: Array<ProductSearchViewState['suggestions'][number]>;
};

export type ProductSearchInteractiveViewState = Pick<ProductSearchViewState, 'searchExpression' | 'isSearching' | 'hasSearched' | 'resultCount' | 'hasResults' | 'hasMore' | 'loadedCount' | 'totalCount' | 'hasSuggestions'> & {
    searchResults: Array<ProductSearchViewState['searchResults'][number]>;
    filters: Pick<ProductSearchViewState['filters'], 'inStockOnly'> & {
    priceRange: ProductSearchViewState['filters']['priceRange'];
    categoryFilter: {
    categories: Array<Pick<ProductSearchViewState['filters']['categoryFilter']['categories'][number], 'categoryId' | 'isSelected'>>;
};
    optionFilters: Array<ProductSearchViewState['filters']['optionFilters'][number]>;
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
    },
    optionFilters: {
      choices: {
        isSelected: HTMLElementCollectionProxy<ChoiceOfOptionFilterOfFilterOfProductSearchViewState, HTMLInputElement>
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
    },
    optionFilters: {
      choices: {
        isSelected: HTMLElementCollectionProxy<ChoiceOfOptionFilterOfFilterOfProductSearchViewState, HTMLInputElement>
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

import { UrlParams } from '@jay-framework/fullstack-component';

export interface ProductSearchParams extends UrlParams {
  prefix?: string;
  category?: string;
}

export type ProductSearchContract = JayContract<ProductSearchViewState, ProductSearchRefs, ProductSearchSlowViewState, ProductSearchFastViewState, ProductSearchInteractiveViewState>

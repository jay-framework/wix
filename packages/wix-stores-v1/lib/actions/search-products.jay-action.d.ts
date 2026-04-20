import { ProductCardViewState } from '../contracts/product-card.jay-contract';

export interface SearchProductsInput {
  query: string;
  filters?: {
    minPrice?: number;
    maxPrice?: number;
    collectionIds?: Array<string>;
  };
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest';
  page?: number;
  pageSize?: number;
}

export interface SearchProductsOutput {
  products: Array<ProductCardViewState>;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  priceAggregation: {
    minBound: number;
    maxBound: number;
    ranges: Array<{
        rangeId: string;
        label: string;
        minValue?: number;
        maxValue?: number;
        isSelected: boolean;
      }>;
  };
}
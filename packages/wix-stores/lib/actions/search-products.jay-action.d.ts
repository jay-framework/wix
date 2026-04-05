import { ProductCardViewState } from '../contracts/product-card.jay-contract';

export interface SearchProductsInput {
    query: string;
    filters?: {
        inStockOnly?: boolean;
        minPrice?: number;
        maxPrice?: number;
        categoryIds?: Array<string>;
        optionFilters?: Array<{
            optionName: string;
            choiceNames: Array<string>;
        }>;
    };
    sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest';
    cursor?: string;
    pageSize?: number;
}

export interface SearchProductsOutput {
    products: Array<ProductCardViewState>;
    totalCount: number;
    nextCursor?: string;
    hasMore: boolean;
    priceAggregation?: {
        minBound: number;
        maxBound: number;
        ranges: Array<{
            rangeId: string;
            label: string;
            minValue?: number;
            maxValue?: number;
            productCount: number;
            isSelected: boolean;
        }>;
    };
    optionFilters?: Array<{
        optionId: string;
        optionName: string;
        optionRenderType: 'TEXT_CHOICES' | 'SWATCH_CHOICES';
        choices: Array<{
            choiceId: string;
            choiceName: string;
            colorCode: string;
            productCount: number;
        }>;
    }>;
    categoryCounts?: Array<{
        categoryId: string;
        productCount: number;
    }>;
}

import type { WixClient } from '@wix/sdk';
import {
    wixFetch,
    type WixFilter,
    type WixSort,
    type WixCursorPaging,
} from '@jay-framework/wix-server-client';
import type { PagingMetadata, AggregationDataAggregationResults, V3Product } from './types.js';
import { normalizeProducts } from './normalize-product.js';

// ============================================================================
// Search request types
// ============================================================================

export interface SearchExpression {
    expression?: string;
    mode?: 'MATCH' | 'EXACT';
    fields?: string[];
}

export interface ScalarAggregation {
    type: 'MIN' | 'MAX' | 'SUM' | 'AVG' | 'COUNT' | 'COUNT_DISTINCT';
}

export interface ValueAggregation {
    limit?: number;
    sortType?: 'VALUE' | 'COUNT';
    sortDirection?: 'ASC' | 'DESC';
    includeInResult?: boolean;
    missingValues?: 'INCLUDE' | 'EXCLUDE';
}

export interface RangeAggregation {
    buckets?: Array<{ from?: number; to?: number }>;
}

export interface DateHistogramAggregation {
    interval?: 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR' | 'MINUTE';
}

export interface NestedAggregation {
    nestedAggregations?: Array<AggregationItem>;
}

export interface AggregationItem {
    fieldPath: string;
    name?: string;
    type?: 'VALUE' | 'SCALAR' | 'RANGE' | 'DATE_HISTOGRAM' | 'NESTED';
    scalar?: ScalarAggregation;
    value?: ValueAggregation;
    range?: RangeAggregation;
    dateHistogram?: DateHistogramAggregation;
    nested?: NestedAggregation;
}

export interface SearchProductsRequest {
    filter?: WixFilter;
    sort?: WixSort[];
    cursorPaging?: WixCursorPaging;
    search?: SearchExpression;
    aggregations?: AggregationItem[];
}

export interface SearchProductsOptions {
    fields?: string[];
}

// ============================================================================
// Response type
// ============================================================================

export interface SearchProductsResponse {
    products?: V3Product[];
    pagingMetadata?: PagingMetadata;
    aggregationData?: {
        results?: AggregationDataAggregationResults[];
    };
}

// ============================================================================
// API call
// ============================================================================

export async function searchProducts(
    client: WixClient,
    search: SearchProductsRequest,
    options?: SearchProductsOptions,
): Promise<SearchProductsResponse> {
    const result = await wixFetch<SearchProductsResponse>(client, '/stores/v3/products/search', {
        method: 'POST',
        body: {
            search,
            ...(options?.fields ? { fields: options.fields } : {}),
        },
    });
    if (result.products) {
        result.products = normalizeProducts(result.products as Record<string, unknown>[]);
    }
    return result;
}

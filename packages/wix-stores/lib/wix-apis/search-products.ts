import type { WixClient } from '@wix/sdk';
import { wixFetch, type WixFilter, type WixCursorPaging } from '@jay-framework/wix-server-client';
import type { V3Product, PagingMetadata, AggregationDataAggregationResults } from './types.js';

// ============================================================================
// Search request types
// ============================================================================

export interface CursorPaging {
    cursor?: string;
    limit?: number;
}

export interface SearchSort {
    fieldName: string;
    order?: 'ASC' | 'DESC';
}

export interface SearchExpression {
    expression?: string;
    mode?: 'MATCH' | 'EXACT';
    fields?: string[];
}

export type ProductFilter = Record<string, Record<string, unknown> | string | number | boolean>;

export interface ScalarAggregation {
    fieldPath: string;
    type: 'MIN' | 'MAX' | 'SUM' | 'AVG' | 'COUNT';
}

export interface ValueAggregation {
    fieldPath: string;
    name?: string;
    limit?: number;
    sortType?: 'VALUE' | 'COUNT';
    sortDirection?: 'ASC' | 'DESC';
    includeInResult?: boolean;
    missingValues?: 'INCLUDE' | 'EXCLUDE';
}

export interface RangeAggregation {
    fieldPath: string;
    buckets?: Array<{ from?: number; to?: number }>;
}

export interface DateHistogramAggregation {
    fieldPath: string;
    interval?: 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR' | 'MINUTE';
}

export interface NestedAggregation {
    fieldPath: string;
    nestedAggregations?: Array<AggregationItem>;
}

export interface AggregationItem {
    name?: string;
    scalar?: ScalarAggregation;
    value?: ValueAggregation;
    range?: RangeAggregation;
    dateHistogram?: DateHistogramAggregation;
    nested?: NestedAggregation;
    type?: 'VALUE' | 'SCALAR' | 'RANGE' | 'DATE_HISTOGRAM' | 'NESTED';
}

export interface SearchProductsRequest {
    filter?: ProductFilter;
    sort?: SearchSort[];
    cursorPaging?: CursorPaging;
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
    metadata?: PagingMetadata;
    aggregationData?: AggregationDataAggregationResults;
}

// ============================================================================
// API call
// ============================================================================

export async function searchProducts(
    client: WixClient,
    search: SearchProductsRequest,
    options?: SearchProductsOptions,
): Promise<SearchProductsResponse> {
    return wixFetch(client, '/stores/v3/products/search', {
        method: 'POST',
        body: {
            ...search,
            ...(options?.fields ? { fields: options.fields } : {}),
        },
    });
}

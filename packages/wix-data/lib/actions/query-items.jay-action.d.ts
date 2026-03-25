export interface QueryItemsInput {
    collectionId: string;
    limit?: number;
    offset?: number;
    sortField?: string;
    sortDirection?: 'ASC' | 'DESC';
    filter?: Record<string, unknown>;
    categoryId?: string;
    categoryField?: string;
}

export interface QueryItemsOutput {
    items: Array<Record<string, unknown>>;
    totalCount: number;
    offset: number;
    hasMore: boolean;
}

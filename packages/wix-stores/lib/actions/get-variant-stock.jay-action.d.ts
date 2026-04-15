export interface GetVariantStockInput {
    productId: string;
}

export type GetVariantStockOutput = Record<string, Record<string, boolean>>;

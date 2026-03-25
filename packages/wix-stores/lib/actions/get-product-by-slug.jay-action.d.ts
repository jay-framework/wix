import { ProductCardViewState } from '../contracts/product-card.jay-contract';

export interface GetProductBySlugInput {
    slug: string;
}

export type GetProductBySlugOutput = ProductCardViewState | null;

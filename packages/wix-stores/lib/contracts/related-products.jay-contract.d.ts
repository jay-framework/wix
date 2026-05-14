import { JayContract } from '@jay-framework/runtime';
import {
    ProductCardViewState,
    ProductCardRefs,
    ProductCardRepeatedRefs,
} from './product-card.jay-contract';

export interface RelatedProductsViewState {
    products: Array<ProductCardViewState>;
    hasProducts: boolean;
    categoryName: string;
}

export type RelatedProductsSlowViewState = Pick<RelatedProductsViewState, 'categoryName'>;

export type RelatedProductsFastViewState = Pick<RelatedProductsViewState, 'hasProducts'> & {
    products: Array<RelatedProductsViewState['products'][number]>;
};

export type RelatedProductsInteractiveViewState = Pick<RelatedProductsViewState, 'hasProducts'> & {
    products: Array<RelatedProductsViewState['products'][number]>;
};

export interface RelatedProductsRefs {
    products: ProductCardRepeatedRefs;
}

export interface RelatedProductsRepeatedRefs {
    products: ProductCardRepeatedRefs;
}

export interface RelatedProductsProps {
    productId?: string;
    categorySlug?: string;
    limit?: number;
}

export type RelatedProductsContract = JayContract<
    RelatedProductsViewState,
    RelatedProductsRefs,
    RelatedProductsSlowViewState,
    RelatedProductsFastViewState,
    RelatedProductsInteractiveViewState,
    RelatedProductsProps
>;

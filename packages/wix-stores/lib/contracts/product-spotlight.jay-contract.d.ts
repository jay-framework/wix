import {JayContract} from "@jay-framework/runtime";
import {ProductCardViewState, ProductCardRefs, ProductCardRepeatedRefs} from "./product-card.jay-contract";

export interface ProductSpotlightViewState {
  product: ProductCardViewState,
  hasProduct: boolean
}

export type ProductSpotlightSlowViewState = {};

export type ProductSpotlightFastViewState = Pick<ProductSpotlightViewState, 'hasProduct'> & {
    product: ProductSpotlightViewState['product'];
};

export type ProductSpotlightInteractiveViewState = Pick<ProductSpotlightViewState, 'hasProduct'> & {
    product: ProductSpotlightViewState['product'];
};


export interface ProductSpotlightRefs {
  product: ProductCardRefs
}


export interface ProductSpotlightRepeatedRefs {
  product: ProductCardRepeatedRefs
}

export interface ProductSpotlightProps {
  slug?: string;
}

export type ProductSpotlightContract = JayContract<ProductSpotlightViewState, ProductSpotlightRefs, ProductSpotlightSlowViewState, ProductSpotlightFastViewState, ProductSpotlightInteractiveViewState, ProductSpotlightProps>

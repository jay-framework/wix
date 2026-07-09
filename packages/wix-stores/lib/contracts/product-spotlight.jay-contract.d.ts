import {JayContract} from "@jay-framework/runtime";
import {ProductCardViewState, ProductCardRefs, ProductCardRepeatedRefs} from "./product-card.jay-contract";

export interface ProductSpotlightViewState {
  product: ProductCardViewState,
  hasProduct: boolean
}

export type ProductSpotlightSlowViewState = Pick<ProductSpotlightViewState, 'hasProduct'> & {
    product: Pick<ProductSpotlightViewState['product'], '_id' | 'name' | 'slug' | 'productUrl' | 'categoryPrefix' | 'hasDiscount' | 'hasRibbon' | 'productType' | 'quickAddType'> & {
    mainMedia: ProductSpotlightViewState['product']['mainMedia'];
    thumbnail: ProductSpotlightViewState['product']['thumbnail'];
    inventory: ProductSpotlightViewState['product']['inventory'];
    ribbon: ProductSpotlightViewState['product']['ribbon'];
    brand: ProductSpotlightViewState['product']['brand'];
    quickOption: Pick<ProductSpotlightViewState['product']['quickOption'], '_id' | 'name' | 'optionRenderType'> & {
    choices: Array<Pick<ProductSpotlightViewState['product']['quickOption']['choices'][number], 'choiceId' | 'name' | 'choiceType' | 'colorCode'>>;
};
    secondQuickOption: Pick<ProductSpotlightViewState['product']['secondQuickOption'], '_id' | 'name' | 'optionRenderType'> & {
    choices: Array<Pick<ProductSpotlightViewState['product']['secondQuickOption']['choices'][number], 'choiceId' | 'name' | 'choiceType' | 'colorCode'>>;
};
};
};

export type ProductSpotlightFastViewState = {
    product: Pick<ProductSpotlightViewState['product'], 'price' | 'strikethroughPrice' | 'isAddingToCart'> & {
    quickOption: {
    choices: Array<Pick<ProductSpotlightViewState['product']['quickOption']['choices'][number], 'choiceId' | 'inStock' | 'isSelected'>>;
};
    secondQuickOption: {
    choices: Array<Pick<ProductSpotlightViewState['product']['secondQuickOption']['choices'][number], 'choiceId' | 'inStock' | 'isSelected'>>;
};
};
};

export type ProductSpotlightInteractiveViewState = {
    product: Pick<ProductSpotlightViewState['product'], 'price' | 'strikethroughPrice' | 'isAddingToCart'> & {
    quickOption: {
    choices: Array<Pick<ProductSpotlightViewState['product']['quickOption']['choices'][number], 'choiceId' | 'inStock' | 'isSelected'>>;
};
    secondQuickOption: {
    choices: Array<Pick<ProductSpotlightViewState['product']['secondQuickOption']['choices'][number], 'choiceId' | 'inStock' | 'isSelected'>>;
};
};
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
import {JayContract} from "@jay-framework/runtime";
import {ProductCardViewState, ProductCardRefs, ProductCardRepeatedRefs} from "./product-card.jay-contract";

export interface CategoryProductsViewState {
  products: Array<ProductCardViewState>,
  hasProducts: boolean,
  categoryName: string
}

export type CategoryProductsSlowViewState = Pick<CategoryProductsViewState, 'categoryName'>;

export type CategoryProductsFastViewState = Pick<CategoryProductsViewState, 'hasProducts'> & {
    products: Array<CategoryProductsViewState['products'][number]>;
};

export type CategoryProductsInteractiveViewState = Pick<CategoryProductsViewState, 'hasProducts'> & {
    products: Array<CategoryProductsViewState['products'][number]>;
};


export interface CategoryProductsRefs {
  products: ProductCardRepeatedRefs
}


export interface CategoryProductsRepeatedRefs {
  products: ProductCardRepeatedRefs
}

export interface CategoryProductsProps {
  productId?: string;
  categorySlug?: string;
  limit?: number;
}

export type CategoryProductsContract = JayContract<CategoryProductsViewState, CategoryProductsRefs, CategoryProductsSlowViewState, CategoryProductsFastViewState, CategoryProductsInteractiveViewState, CategoryProductsProps>

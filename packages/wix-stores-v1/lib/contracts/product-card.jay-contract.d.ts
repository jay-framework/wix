import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";
import {ProductOptionsViewState, ProductOptionsRefs, ProductOptionsRepeatedRefs} from "./product-options.jay-contract";

export enum MediaType {
  IMAGE,
  VIDEO
}

export interface MainMediaOfProductCardViewState {
  url: string,
  altText: string,
  mediaType: MediaType
}

export interface ThumbnailOfProductCardViewState {
  url: string,
  altText: string,
  width: number,
  height: number
}

export interface MinValueOfActualPriceRangeOfProductCardViewState {
  amount: string,
  formattedAmount: string
}

export interface MaxValueOfActualPriceRangeOfProductCardViewState {
  amount: string,
  formattedAmount: string
}

export interface ActualPriceRangeOfProductCardViewState {
  minValue: MinValueOfActualPriceRangeOfProductCardViewState,
  maxValue: MaxValueOfActualPriceRangeOfProductCardViewState
}

export interface MinValueOfCompareAtPriceRangeOfProductCardViewState {
  amount: string,
  formattedAmount: string
}

export interface MaxValueOfCompareAtPriceRangeOfProductCardViewState {
  amount: string,
  formattedAmount: string
}

export interface CompareAtPriceRangeOfProductCardViewState {
  minValue: MinValueOfCompareAtPriceRangeOfProductCardViewState,
  maxValue: MaxValueOfCompareAtPriceRangeOfProductCardViewState
}

export enum AvailabilityStatus {
  IN_STOCK,
  OUT_OF_STOCK,
  PARTIALLY_OUT_OF_STOCK
}

export enum PreorderStatus {
  ENABLED,
  DISABLED,
  PARTIALLY_ENABLED
}

export interface InventoryOfProductCardViewState {
  availabilityStatus: AvailabilityStatus,
  preorderStatus: PreorderStatus
}

export interface RibbonOfProductCardViewState {
  _id: string,
  name: string
}

export interface BrandOfProductCardViewState {
  _id: string,
  name: string
}

export enum ProductType {
  PHYSICAL,
  DIGITAL
}

export enum QuickAddType {
  SIMPLE,
  SINGLE_OPTION,
  NEEDS_CONFIGURATION
}

export interface ProductCardViewState {
  _id: string,
  name: string,
  slug: string,
  productUrl: string,
  mainMedia: MainMediaOfProductCardViewState,
  thumbnail: ThumbnailOfProductCardViewState,
  actualPriceRange: ActualPriceRangeOfProductCardViewState,
  compareAtPriceRange: CompareAtPriceRangeOfProductCardViewState,
  currency: string,
  hasDiscount: boolean,
  inventory: InventoryOfProductCardViewState,
  ribbon: RibbonOfProductCardViewState,
  hasRibbon: boolean,
  brand: BrandOfProductCardViewState,
  productType: ProductType,
  visible: boolean,
  isAddingToCart: boolean,
  quickAddType: QuickAddType,
  quickOption: ProductOptionsViewState
}

export type ProductCardSlowViewState = Pick<ProductCardViewState, '_id' | 'name' | 'slug' | 'productUrl' | 'currency' | 'hasDiscount' | 'hasRibbon' | 'productType' | 'visible' | 'quickAddType'> & {
    mainMedia: ProductCardViewState['mainMedia'];
    thumbnail: ProductCardViewState['thumbnail'];
    actualPriceRange: ProductCardViewState['actualPriceRange'];
    compareAtPriceRange: ProductCardViewState['compareAtPriceRange'];
    inventory: ProductCardViewState['inventory'];
    ribbon: ProductCardViewState['ribbon'];
    brand: ProductCardViewState['brand'];
    quickOption: Pick<ProductCardViewState['quickOption'], '_id' | 'name' | 'optionRenderType'> & {
    choices: Array<Pick<ProductCardViewState['quickOption']['choices'][number], 'choiceId' | 'name' | 'choiceType' | 'colorCode' | 'variantId'>>;
};
};

export type ProductCardFastViewState = Pick<ProductCardViewState, 'isAddingToCart'> & {
    quickOption: {
    choices: Array<Pick<ProductCardViewState['quickOption']['choices'][number], 'choiceId' | 'inStock' | 'isSelected'>>;
};
};

export type ProductCardInteractiveViewState = Pick<ProductCardViewState, 'isAddingToCart'> & {
    quickOption: {
    choices: Array<Pick<ProductCardViewState['quickOption']['choices'][number], 'choiceId' | 'inStock' | 'isSelected'>>;
};
};


export interface ProductCardRefs {
  productLink: HTMLElementProxy<ProductCardViewState, HTMLAnchorElement>,
  addToCartButton: HTMLElementProxy<ProductCardViewState, HTMLButtonElement>,
  viewOptionsButton: HTMLElementProxy<ProductCardViewState, HTMLButtonElement>,
  quickOption: ProductOptionsRefs
}


export interface ProductCardRepeatedRefs {
  productLink: HTMLElementCollectionProxy<ProductCardViewState, HTMLAnchorElement>,
  addToCartButton: HTMLElementCollectionProxy<ProductCardViewState, HTMLButtonElement>,
  viewOptionsButton: HTMLElementCollectionProxy<ProductCardViewState, HTMLButtonElement>,
  quickOption: ProductOptionsRepeatedRefs
}

export type ProductCardContract = JayContract<ProductCardViewState, ProductCardRefs, ProductCardSlowViewState, ProductCardFastViewState, ProductCardInteractiveViewState>
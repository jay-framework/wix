import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


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
  isAddingToCart: boolean
}

export type ProductCardSlowViewState = Pick<ProductCardViewState, '_id' | 'name' | 'slug' | 'productUrl' | 'currency' | 'hasDiscount' | 'hasRibbon' | 'productType' | 'visible' | 'isAddingToCart'> & {
    mainMedia: ProductCardViewState['mainMedia'];
    thumbnail: ProductCardViewState['thumbnail'];
    actualPriceRange: {
    minValue: ProductCardViewState['actualPriceRange']['minValue'];
    maxValue: ProductCardViewState['actualPriceRange']['maxValue'];
};
    compareAtPriceRange: {
    minValue: ProductCardViewState['compareAtPriceRange']['minValue'];
    maxValue: ProductCardViewState['compareAtPriceRange']['maxValue'];
};
    inventory: ProductCardViewState['inventory'];
    ribbon: ProductCardViewState['ribbon'];
    brand: ProductCardViewState['brand'];
};

export type ProductCardFastViewState = {};

export type ProductCardInteractiveViewState = {};


export interface ProductCardRefs {
  productLink: HTMLElementProxy<ProductCardViewState, HTMLAnchorElement>,
  addToCartButton: HTMLElementProxy<ProductCardViewState, HTMLButtonElement>
}


export interface ProductCardRepeatedRefs {
  productLink: HTMLElementCollectionProxy<ProductCardViewState, HTMLAnchorElement>,
  addToCartButton: HTMLElementCollectionProxy<ProductCardViewState, HTMLButtonElement>
}

export type ProductCardContract = JayContract<ProductCardViewState, ProductCardRefs, ProductCardSlowViewState, ProductCardFastViewState, ProductCardInteractiveViewState>
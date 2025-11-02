import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export enum InventoryStatus {
  inStock,
  outOfStock,
  lowStock
}

export interface ProductCardViewState {
  productId: string,
  productName: string,
  productSlug: string,
  productImage: string,
  imageAltText: string,
  actualPrice: string,
  compareAtPrice: string,
  hasDiscount: boolean,
  discountPercentage: number,
  inventoryStatus: InventoryStatus,
  inventoryBadge: string,
  hasRibbon: boolean,
  ribbonText: string,
  isAddingToCart: boolean,
  brandName: string,
  shortDescription: string,
  hasRating: boolean,
  averageRating: number,
  reviewCount: number
}


export interface ProductCardRefs {
  productLink: HTMLElementProxy<ProductCardViewState, HTMLAnchorElement>,
  addToCartButton: HTMLElementProxy<ProductCardViewState, HTMLButtonElement>
}


export interface ProductCardRepeatedRefs {
  productLink: HTMLElementCollectionProxy<ProductCardViewState, HTMLAnchorElement>,
  addToCartButton: HTMLElementCollectionProxy<ProductCardViewState, HTMLButtonElement>
}

export type ProductCardContract = JayContract<ProductCardViewState, ProductCardRefs>
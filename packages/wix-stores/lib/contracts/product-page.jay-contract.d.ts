import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface MinValueOfActualPriceRangeOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface MaxValueOfActualPriceRangeOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface ActualPriceRangeOfProductPageViewState {
  minValue: MinValueOfActualPriceRangeOfProductPageViewState,
  maxValue: MaxValueOfActualPriceRangeOfProductPageViewState
}

export interface MinValueOfCompareAtPriceRangeOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface MaxValueOfCompareAtPriceRangeOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface CompareAtPriceRangeOfProductPageViewState {
  minValue: MinValueOfCompareAtPriceRangeOfProductPageViewState,
  maxValue: MaxValueOfCompareAtPriceRangeOfProductPageViewState
}

export enum MediaType {
  IMAGE,
  VIDEO
}

export interface MainOfMediaOfProductPageViewState {
  id: string,
  url: string,
  altText: string,
  mediaType: MediaType,
  displayName: string
}

export enum MediaType {
  IMAGE,
  VIDEO
}

export interface ThumbnailOfItemOfItemsInfoOfMediaOfProductPageViewState {
  url: string,
  altText: string,
  width: number,
  height: number
}

export interface ItemOfItemsInfoOfMediaOfProductPageViewState {
  id: string,
  url: string,
  altText: string,
  mediaType: MediaType,
  displayName: string,
  thumbnail: Array<ThumbnailOfItemOfItemsInfoOfMediaOfProductPageViewState>
}

export interface ItemsInfoOfMediaOfProductPageViewState {
  items: Array<ItemOfItemsInfoOfMediaOfProductPageViewState>
}

export interface MediaOfProductPageViewState {
  main: MainOfMediaOfProductPageViewState,
  itemsInfo: ItemsInfoOfMediaOfProductPageViewState
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

export enum PreorderAvailability {
  ALL_VARIANTS,
  NO_VARIANTS,
  SOME_VARIANTS
}

export interface InventoryOfProductPageViewState {
  availabilityStatus: AvailabilityStatus,
  preorderStatus: PreorderStatus,
  preorderAvailability: PreorderAvailability
}

export enum OptionRenderType {
  TEXT_CHOICES,
  SWATCH_CHOICES
}

export enum ChoiceType {
  CHOICE_TEXT,
  ONE_COLOR,
  MULTIPLE_COLORS,
  IMAGE
}

export interface ChoiceOfOptionOfProductPageViewState {
  choiceId: string,
  name: string,
  choiceType: ChoiceType,
  colorCode: string,
  inStock: boolean,
  visible: boolean,
  isSelected: boolean
}

export interface OptionOfProductPageViewState {
  id: string,
  name: string,
  optionRenderType: OptionRenderType,
  choices: Array<ChoiceOfOptionOfProductPageViewState>
}

export interface QuantityOfProductPageViewState {
  currentQuantity: number,
  quantityInput: number
}

export interface ActualPriceOfPriceOfCurrentVariantOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface CompareAtPriceOfPriceOfCurrentVariantOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface PriceOfCurrentVariantOfProductPageViewState {
  actualPrice: ActualPriceOfPriceOfCurrentVariantOfProductPageViewState,
  compareAtPrice: CompareAtPriceOfPriceOfCurrentVariantOfProductPageViewState
}

export interface InventoryStatusOfCurrentVariantOfProductPageViewState {
  inStock: boolean,
  preorderEnabled: boolean
}

export interface CurrentVariantOfProductPageViewState {
  id: string,
  sku: string,
  barcode: string,
  price: PriceOfCurrentVariantOfProductPageViewState,
  inventoryStatus: InventoryStatusOfCurrentVariantOfProductPageViewState,
  visible: boolean
}

export interface BrandOfProductPageViewState {
  id: string,
  name: string
}

export interface RibbonOfProductPageViewState {
  id: string,
  name: string
}

export interface BreadcrumbOfBreadcrumbsInfoOfProductPageViewState {
  categoryId: string,
  categoryName: string,
  categorySlug: string
}

export interface BreadcrumbsInfoOfProductPageViewState {
  breadcrumbs: Array<BreadcrumbOfBreadcrumbsInfoOfProductPageViewState>
}

export interface CategoryOfAllCategoriesInfoOfProductPageViewState {
  id: string,
  index: number
}

export interface AllCategoriesInfoOfProductPageViewState {
  categories: Array<CategoryOfAllCategoriesInfoOfProductPageViewState>
}

export interface CategoryOfDirectCategoriesInfoOfProductPageViewState {
  id: string,
  index: number
}

export interface DirectCategoriesInfoOfProductPageViewState {
  categories: Array<CategoryOfDirectCategoriesInfoOfProductPageViewState>
}

export interface InfoSectionOfProductPageViewState {
  id: string,
  title: string,
  uniqueName: string,
  description: string,
  plainDescription: string
}

export enum ProductType {
  PHYSICAL,
  DIGITAL
}

export interface VariantSummaryOfProductPageViewState {
  variantCount: number
}

export interface ProductPageViewState {
  id: string,
  name: string,
  slug: string,
  description: string,
  plainDescription: string,
  actualPriceRange: ActualPriceRangeOfProductPageViewState,
  compareAtPriceRange: CompareAtPriceRangeOfProductPageViewState,
  currency: string,
  media: MediaOfProductPageViewState,
  inventory: InventoryOfProductPageViewState,
  options: Array<OptionOfProductPageViewState>,
  quantity: QuantityOfProductPageViewState,
  isAddingToCart: boolean,
  currentVariant: CurrentVariantOfProductPageViewState,
  brand: BrandOfProductPageViewState,
  ribbon: RibbonOfProductPageViewState,
  mainCategoryId: string,
  breadcrumbsInfo: BreadcrumbsInfoOfProductPageViewState,
  allCategoriesInfo: AllCategoriesInfoOfProductPageViewState,
  directCategoriesInfo: DirectCategoriesInfoOfProductPageViewState,
  infoSections: Array<InfoSectionOfProductPageViewState>,
  productType: ProductType,
  handle: string,
  visible: boolean,
  visibleInPos: boolean,
  taxGroupId: string,
  url: string,
  createdDate: string,
  updatedDate: string,
  revision: string,
  variantSummary: VariantSummaryOfProductPageViewState
}


export interface ProductPageRefs {
  addToCartButton: HTMLElementProxy<ProductPageViewState, HTMLButtonElement>,
  options: {
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfOptionOfProductPageViewState, HTMLButtonElement>
    }
  },
  quantity: {
    decrementButton: HTMLElementProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    incrementButton: HTMLElementProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    quantityInput: HTMLElementProxy<QuantityOfProductPageViewState, HTMLInputElement>
  }
}


export interface ProductPageRepeatedRefs {
  addToCartButton: HTMLElementCollectionProxy<ProductPageViewState, HTMLButtonElement>,
  options: {
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfOptionOfProductPageViewState, HTMLButtonElement>
    }
  },
  quantity: {
    decrementButton: HTMLElementCollectionProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    incrementButton: HTMLElementCollectionProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    quantityInput: HTMLElementCollectionProxy<QuantityOfProductPageViewState, HTMLInputElement>
  }
}

export type ProductPageContract = JayContract<ProductPageViewState, ProductPageRefs>
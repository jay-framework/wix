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

export interface InfoSectionOfProductPageViewState {
  id: string,
  title: string,
  uniqueName: string,
  plainDescription: string
}

export enum ProductType {
  PHYSICAL,
  DIGITAL
}

export interface VariantSummaryOfProductPageViewState {
  variantCount: number
}

export interface OptionChoiceIdOfChoiceOfVariantOfVariantsInfoOfProductPageViewState {
  optionId: string,
  choiceId: string
}

export enum RenderType {
  TEXT_CHOICES,
  SWATCH_CHOICES
}

export interface OptionChoiceNameOfChoiceOfVariantOfVariantsInfoOfProductPageViewState {
  optionName: string,
  choiceName: string,
  renderType: RenderType
}

export interface ChoiceOfVariantOfVariantsInfoOfProductPageViewState {
  optionChoiceIds: Array<OptionChoiceIdOfChoiceOfVariantOfVariantsInfoOfProductPageViewState>,
  optionChoiceNames: Array<OptionChoiceNameOfChoiceOfVariantOfVariantsInfoOfProductPageViewState>
}

export interface ActualPriceOfPriceOfVariantOfVariantsInfoOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface CompareAtPriceOfPriceOfVariantOfVariantsInfoOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface PriceOfVariantOfVariantsInfoOfProductPageViewState {
  actualPrice: Array<ActualPriceOfPriceOfVariantOfVariantsInfoOfProductPageViewState>,
  compareAtPrice: Array<CompareAtPriceOfPriceOfVariantOfVariantsInfoOfProductPageViewState>
}

export interface InventoryStatusOfVariantOfVariantsInfoOfProductPageViewState {
  inStock: boolean,
  preorderEnabled: boolean
}

export interface CostOfRevenueDetailOfVariantOfVariantsInfoOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface ProfitOfRevenueDetailOfVariantOfVariantsInfoOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface RevenueDetailOfVariantOfVariantsInfoOfProductPageViewState {
  cost: Array<CostOfRevenueDetailOfVariantOfVariantsInfoOfProductPageViewState>,
  profit: Array<ProfitOfRevenueDetailOfVariantOfVariantsInfoOfProductPageViewState>,
  profitMargin: number
}

export enum MediaType {
  IMAGE,
  VIDEO
}

export interface ThumbnailOfMediaOfVariantOfVariantsInfoOfProductPageViewState {
  url: string,
  altText: string,
  width: number,
  height: number
}

export interface MediaOfVariantOfVariantsInfoOfProductPageViewState {
  id: string,
  altText: string,
  displayName: string,
  mediaType: MediaType,
  thumbnail: Array<ThumbnailOfMediaOfVariantOfVariantsInfoOfProductPageViewState>,
  url: string
}

export interface PriceOfSubscriptionPriceOfSubscriptionPricesInfoOfVariantOfVariantsInfoOfProductPageViewState {
  amount: string,
  formattedAmount: string
}

export interface PricePerUnitOfSubscriptionPriceOfSubscriptionPricesInfoOfVariantOfVariantsInfoOfProductPageViewState {
  value: string,
  description: string
}

export interface SubscriptionPriceOfSubscriptionPricesInfoOfVariantOfVariantsInfoOfProductPageViewState {
  subscriptionId: string,
  price: Array<PriceOfSubscriptionPriceOfSubscriptionPricesInfoOfVariantOfVariantsInfoOfProductPageViewState>,
  pricePerUnit: Array<PricePerUnitOfSubscriptionPriceOfSubscriptionPricesInfoOfVariantOfVariantsInfoOfProductPageViewState>
}

export interface SubscriptionPricesInfoOfVariantOfVariantsInfoOfProductPageViewState {
  subscriptionPrices: Array<SubscriptionPriceOfSubscriptionPricesInfoOfVariantOfVariantsInfoOfProductPageViewState>
}

export enum MeasurementUnit {
  UNSPECIFIED,
  ML,
  CL,
  L,
  CBM,
  MG,
  G,
  KG,
  MM,
  CM,
  M,
  SQM,
  OZ,
  LB,
  FLOZ,
  PT,
  QT,
  GAL,
  IN,
  FT,
  YD,
  SQFT
}

export interface SettingOfPricePerUnitOfPhysicalPropertyOfVariantOfVariantsInfoOfProductPageViewState {
  quantity: number,
  measurementUnit: MeasurementUnit
}

export interface PricePerUnitOfPhysicalPropertyOfVariantOfVariantsInfoOfProductPageViewState {
  value: string,
  description: string,
  settings: Array<SettingOfPricePerUnitOfPhysicalPropertyOfVariantOfVariantsInfoOfProductPageViewState>
}

export interface PhysicalPropertyOfVariantOfVariantsInfoOfProductPageViewState {
  weight: number,
  pricePerUnit: Array<PricePerUnitOfPhysicalPropertyOfVariantOfVariantsInfoOfProductPageViewState>
}

export enum FileType {
  SECURE_ARCHIVE,
  SECURE_MUSIC,
  SECURE_DOCUMENT,
  SECURE_VIDEO,
  SECURE_PICTURE,
  UNSPECIFIED
}

export interface DigitalFileOfDigitalPropertyOfVariantOfVariantsInfoOfProductPageViewState {
  id: string,
  fileName: string,
  fileSize: string,
  fileType: FileType
}

export interface DigitalPropertyOfVariantOfVariantsInfoOfProductPageViewState {
  digitalFile: Array<DigitalFileOfDigitalPropertyOfVariantOfVariantsInfoOfProductPageViewState>
}

export interface VariantOfVariantsInfoOfProductPageViewState {
  id: string,
  visible: boolean,
  sku: string,
  barcode: string,
  choices: Array<ChoiceOfVariantOfVariantsInfoOfProductPageViewState>,
  price: Array<PriceOfVariantOfVariantsInfoOfProductPageViewState>,
  inventoryStatus: Array<InventoryStatusOfVariantOfVariantsInfoOfProductPageViewState>,
  revenueDetails: Array<RevenueDetailOfVariantOfVariantsInfoOfProductPageViewState>,
  media: Array<MediaOfVariantOfVariantsInfoOfProductPageViewState>,
  subscriptionPricesInfo: Array<SubscriptionPricesInfoOfVariantOfVariantsInfoOfProductPageViewState>,
  physicalProperties: Array<PhysicalPropertyOfVariantOfVariantsInfoOfProductPageViewState>,
  digitalProperties: Array<DigitalPropertyOfVariantOfVariantsInfoOfProductPageViewState>
}

export interface VariantsInfoOfProductPageViewState {
  variants: Array<VariantOfVariantsInfoOfProductPageViewState>
}

export interface ProductPageViewState {
  id: string,
  name: string,
  slug: string,
  plainDescription: string,
  actualPriceRange: ActualPriceRangeOfProductPageViewState,
  compareAtPriceRange: CompareAtPriceRangeOfProductPageViewState,
  currency: string,
  media: MediaOfProductPageViewState,
  inventory: InventoryOfProductPageViewState,
  options: Array<OptionOfProductPageViewState>,
  quantity: QuantityOfProductPageViewState,
  isAddingToCart: boolean,
  currentVariant: Array<VariantOfVariantsInfoOfProductPageViewState> | null,
  brand: BrandOfProductPageViewState,
  ribbon: RibbonOfProductPageViewState,
  mainCategoryId: string,
  breadcrumbsInfo: BreadcrumbsInfoOfProductPageViewState,
  allCategoriesInfo: AllCategoriesInfoOfProductPageViewState,
  directCategoriesInfo: AllCategoriesInfoOfProductPageViewState | null,
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
  variantSummary: VariantSummaryOfProductPageViewState,
  variantsInfo: VariantsInfoOfProductPageViewState
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
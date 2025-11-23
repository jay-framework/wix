import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";
import {MediaGalleryViewState, MediaGalleryRefs, MediaGalleryRepeatedRefs} from "./media-gallery.jay-contract";

export enum OptionRenderType {
  TEXT_CHOICES,
  COLOR_SWATCH_CHOICES
}

export enum ChoiceType {
  CHOICE_TEXT,
  ONE_COLOR
}

export interface ChoiceOfOptionOfProductPageViewState {
  choiceId: string,
  choiceType: ChoiceType,
  name: string,
  colorCode: string,
  inStock: boolean,
  isSelected: boolean
}

export interface OptionOfProductPageViewState {
  id: string,
  name: string,
  optionRenderType: OptionRenderType,
  textChoiceSelection: string,
  choices: Array<ChoiceOfOptionOfProductPageViewState>
}

export interface QuantityOfProductPageViewState {
  currentQuantity: number
}

export enum StockStatus {
  OUT_OF_STOCK,
  IN_STOCK
}

export interface InfoSectionOfProductPageViewState {
  id: string,
  title: string,
  plainDescription: string
}

export enum ModifierType {
  TEXT_CHOICES,
  COLOR_SWATCH_CHOICES,
  FREE_TEXT
}

export enum ChoiceType {
  CHOICE_TEXT,
  ONE_COLOR
}

export interface ChoiceOfModifierOfProductPageViewState {
  choiceId: string,
  choiceType: ChoiceType,
  name: string,
  colorCode: string,
  isSelected: boolean
}

export interface ModifierOfProductPageViewState {
  id: string,
  name: string,
  modifierType: ModifierType,
  textModifierSelection: string,
  textInputLength: string,
  textInputRequired: string,
  choices: Array<ChoiceOfModifierOfProductPageViewState>
}

export enum ProductType {
  PHYSICAL,
  DIGITAL
}

export interface PropOfTagOfSeoDatumOfProductPageViewState {
  key: string,
  value: string
}

export interface MetaOfTagOfSeoDatumOfProductPageViewState {
  key: string,
  value: string
}

export interface TagOfSeoDatumOfProductPageViewState {
  type: string,
  props: Array<PropOfTagOfSeoDatumOfProductPageViewState>,
  meta: Array<MetaOfTagOfSeoDatumOfProductPageViewState>,
  children: string
}

export interface KeywordOfSettingOfSeoDatumOfProductPageViewState {
  term: string,
  isMain: boolean,
  origin: string
}

export interface SettingOfSeoDatumOfProductPageViewState {
  preventAutoRedirect: boolean,
  keywords: Array<KeywordOfSettingOfSeoDatumOfProductPageViewState>
}

export interface SeoDatumOfProductPageViewState {
  tags: Array<TagOfSeoDatumOfProductPageViewState>,
  settings: SettingOfSeoDatumOfProductPageViewState
}

export interface ProductPageViewState {
  id: string,
  productName: string,
  mediaGallery: MediaGalleryViewState,
  description: string,
  sku: string,
  brand: string,
  ribbon: string,
  options: Array<OptionOfProductPageViewState>,
  quantity: QuantityOfProductPageViewState,
  stockStatus: StockStatus,
  infoSections: Array<InfoSectionOfProductPageViewState>,
  modifiers: Array<ModifierOfProductPageViewState>,
  price: string,
  strikethroughPrice: string,
  pricePerUnit: string,
  productType: ProductType,
  seoData: SeoDatumOfProductPageViewState,
  actionsEnabled: boolean
}


export interface ProductPageRefs {
  addToCartButton: HTMLElementProxy<ProductPageViewState, HTMLButtonElement>,
  buyNowButton: HTMLElementProxy<ProductPageViewState, HTMLButtonElement>,
  mediaGallery: MediaGalleryRefs,
  options: {
    textChoice: HTMLElementCollectionProxy<OptionOfProductPageViewState, HTMLSelectElement>,
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfOptionOfProductPageViewState, HTMLButtonElement>
    }
  },
  quantity: {
    decrementButton: HTMLElementProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    incrementButton: HTMLElementProxy<QuantityOfProductPageViewState, HTMLButtonElement>
  },
  modifiers: {
    textModifier: HTMLElementCollectionProxy<ModifierOfProductPageViewState, HTMLSelectElement>,
    textInput: HTMLElementCollectionProxy<ModifierOfProductPageViewState, HTMLInputElement | HTMLAreaElement>,
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfModifierOfProductPageViewState, HTMLButtonElement>
    }
  }
}


export interface ProductPageRepeatedRefs {
  addToCartButton: HTMLElementCollectionProxy<ProductPageViewState, HTMLButtonElement>,
  buyNowButton: HTMLElementCollectionProxy<ProductPageViewState, HTMLButtonElement>,
  mediaGallery: MediaGalleryRepeatedRefs,
  options: {
    textChoice: HTMLElementCollectionProxy<OptionOfProductPageViewState, HTMLSelectElement>,
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfOptionOfProductPageViewState, HTMLButtonElement>
    }
  },
  quantity: {
    decrementButton: HTMLElementCollectionProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    incrementButton: HTMLElementCollectionProxy<QuantityOfProductPageViewState, HTMLButtonElement>
  },
  modifiers: {
    textModifier: HTMLElementCollectionProxy<ModifierOfProductPageViewState, HTMLSelectElement>,
    textInput: HTMLElementCollectionProxy<ModifierOfProductPageViewState, HTMLInputElement | HTMLAreaElement>,
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfModifierOfProductPageViewState, HTMLButtonElement>
    }
  }
}

export type ProductPageContract = JayContract<ProductPageViewState, ProductPageRefs>
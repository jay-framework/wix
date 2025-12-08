import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";
import {MediaGalleryViewState, MediaGalleryRefs, MediaGalleryRepeatedRefs} from "./media-gallery.jay-contract";

export enum ProductType {
  PHYSICAL,
  DIGITAL
}

export enum StockStatus {
  OUT_OF_STOCK,
  IN_STOCK
}

export interface QuantityOfProductPageViewState {
  quantity: number
}

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
  textInputLength: number,
  textInputRequired: boolean,
  choices: Array<ChoiceOfModifierOfProductPageViewState>
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
  brand: string,
  ribbon: string,
  productType: ProductType,
  sku: string,
  price: string,
  strikethroughPrice: string,
  pricePerUnit: string,
  stockStatus: StockStatus,
  quantity: QuantityOfProductPageViewState,
  actionsEnabled: boolean,
  options: Array<OptionOfProductPageViewState>,
  infoSections: Array<InfoSectionOfProductPageViewState>,
  modifiers: Array<ModifierOfProductPageViewState>,
  seoData: SeoDatumOfProductPageViewState
}

export type ProductPageSlowViewState = Pick<ProductPageViewState, 'id' | 'productName' | 'description' | 'brand' | 'ribbon' | 'productType'> & {
    options: Array<Pick<ProductPageViewState['options'][number], 'id' | 'name' | 'optionRenderType'> & {
    choices: Array<Pick<ProductPageViewState['options'][number]['choices'][number], 'choiceId' | 'choiceType' | 'name' | 'colorCode' | 'inStock'>>;
}>;
    infoSections: Array<ProductPageViewState['infoSections'][number]>;
    modifiers: Array<Pick<ProductPageViewState['modifiers'][number], 'id' | 'name' | 'modifierType' | 'textInputLength' | 'textInputRequired'> & {
    choices: Array<Pick<ProductPageViewState['modifiers'][number]['choices'][number], 'choiceId' | 'choiceType' | 'name' | 'colorCode'>>;
}>;
    seoData: {
    tags: Array<Pick<ProductPageViewState['seoData']['tags'][number], 'type' | 'children'> & {
    props: Array<ProductPageViewState['seoData']['tags'][number]['props'][number]>;
    meta: Array<ProductPageViewState['seoData']['tags'][number]['meta'][number]>;
}>;
    settings: Pick<ProductPageViewState['seoData']['settings'], 'preventAutoRedirect'> & {
    keywords: Array<ProductPageViewState['seoData']['settings']['keywords'][number]>;
};
};
};

export type ProductPageFastViewState = Pick<ProductPageViewState, 'mediaGallery' | 'sku' | 'price' | 'strikethroughPrice' | 'pricePerUnit' | 'stockStatus' | 'actionsEnabled'> & {
    quantity: ProductPageViewState['quantity'];
    options: Array<Pick<ProductPageViewState['options'][number], 'textChoiceSelection'> & {
    choices: Array<Pick<ProductPageViewState['options'][number]['choices'][number], 'isSelected'>>;
}>;
    modifiers: Array<Pick<ProductPageViewState['modifiers'][number], 'textModifierSelection'> & {
    choices: Array<Pick<ProductPageViewState['modifiers'][number]['choices'][number], 'isSelected'>>;
}>;
};

export type ProductPageInteractiveViewState = Pick<ProductPageViewState, 'mediaGallery' | 'sku' | 'price' | 'strikethroughPrice' | 'pricePerUnit' | 'stockStatus' | 'actionsEnabled'> & {
    quantity: ProductPageViewState['quantity'];
    options: Array<Pick<ProductPageViewState['options'][number], 'textChoiceSelection'> & {
    choices: Array<Pick<ProductPageViewState['options'][number]['choices'][number], 'isSelected'>>;
}>;
    modifiers: Array<Pick<ProductPageViewState['modifiers'][number], 'textModifierSelection'> & {
    choices: Array<Pick<ProductPageViewState['modifiers'][number]['choices'][number], 'isSelected'>>;
}>;
};


export interface ProductPageRefs {
  addToCartButton: HTMLElementProxy<ProductPageViewState, HTMLButtonElement>,
  buyNowButton: HTMLElementProxy<ProductPageViewState, HTMLButtonElement>,
  mediaGallery: MediaGalleryRefs,
  quantity: {
    decrementButton: HTMLElementProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    incrementButton: HTMLElementProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    quantity: HTMLElementProxy<QuantityOfProductPageViewState, HTMLInputElement>
  },
  options: {
    textChoice: HTMLElementCollectionProxy<OptionOfProductPageViewState, HTMLSelectElement>,
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfOptionOfProductPageViewState, HTMLButtonElement>
    }
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
  quantity: {
    decrementButton: HTMLElementCollectionProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    incrementButton: HTMLElementCollectionProxy<QuantityOfProductPageViewState, HTMLButtonElement>,
    quantity: HTMLElementCollectionProxy<QuantityOfProductPageViewState, HTMLInputElement>
  },
  options: {
    textChoice: HTMLElementCollectionProxy<OptionOfProductPageViewState, HTMLSelectElement>,
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfOptionOfProductPageViewState, HTMLButtonElement>
    }
  },
  modifiers: {
    textModifier: HTMLElementCollectionProxy<ModifierOfProductPageViewState, HTMLSelectElement>,
    textInput: HTMLElementCollectionProxy<ModifierOfProductPageViewState, HTMLInputElement | HTMLAreaElement>,
    choices: {
      choiceButton: HTMLElementCollectionProxy<ChoiceOfModifierOfProductPageViewState, HTMLButtonElement>
    }
  }
}

export type ProductPageContract = JayContract<ProductPageViewState, ProductPageRefs, ProductPageSlowViewState, ProductPageFastViewState, ProductPageInteractiveViewState>
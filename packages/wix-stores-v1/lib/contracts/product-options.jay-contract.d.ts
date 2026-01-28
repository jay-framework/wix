import {HTMLElementCollectionProxy, JayContract} from "@jay-framework/runtime";


export enum OptionRenderType {
  TEXT_CHOICES,
  COLOR_SWATCH_CHOICES
}

export enum ChoiceType {
  CHOICE_TEXT,
  ONE_COLOR
}

export interface ChoiceOfProductOptionsViewState {
  choiceId: string,
  name: string,
  choiceType: ChoiceType,
  colorCode: string,
  inStock: boolean,
  variantId: string,
  isSelected: boolean
}

export interface ProductOptionsViewState {
  _id: string,
  name: string,
  optionRenderType: OptionRenderType,
  choices: Array<ChoiceOfProductOptionsViewState>
}

export type ProductOptionsSlowViewState = Pick<ProductOptionsViewState, '_id' | 'name' | 'optionRenderType'> & {
    choices: Array<Pick<ProductOptionsViewState['choices'][number], 'choiceId' | 'name' | 'choiceType' | 'colorCode' | 'variantId'>>;
};

export type ProductOptionsFastViewState = {
    choices: Array<Pick<ProductOptionsViewState['choices'][number], 'choiceId' | 'inStock' | 'isSelected'>>;
};

export type ProductOptionsInteractiveViewState = {
    choices: Array<Pick<ProductOptionsViewState['choices'][number], 'choiceId' | 'inStock' | 'isSelected'>>;
};


export interface ProductOptionsRefs {
  choices: {
    choiceButton: HTMLElementCollectionProxy<ChoiceOfProductOptionsViewState, HTMLButtonElement>
  }
}


export interface ProductOptionsRepeatedRefs {
  choices: {
    choiceButton: HTMLElementCollectionProxy<ChoiceOfProductOptionsViewState, HTMLButtonElement>
  }
}

export type ProductOptionsContract = JayContract<ProductOptionsViewState, ProductOptionsRefs, ProductOptionsSlowViewState, ProductOptionsFastViewState, ProductOptionsInteractiveViewState>
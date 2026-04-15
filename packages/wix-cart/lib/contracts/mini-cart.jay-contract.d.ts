import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface MiniCartViewState {
    isOpen: boolean;
}

export type MiniCartSlowViewState = {};

export type MiniCartFastViewState = Pick<MiniCartViewState, 'isOpen'>;

export type MiniCartInteractiveViewState = Pick<MiniCartViewState, 'isOpen'>;

export interface MiniCartRefs {
    openButton: HTMLElementProxy<MiniCartViewState, HTMLButtonElement>;
    closeButton: HTMLElementProxy<MiniCartViewState, HTMLButtonElement>;
}

export interface MiniCartRepeatedRefs {
    openButton: HTMLElementCollectionProxy<MiniCartViewState, HTMLButtonElement>;
    closeButton: HTMLElementCollectionProxy<MiniCartViewState, HTMLButtonElement>;
}

export type MiniCartContract = JayContract<
    MiniCartViewState,
    MiniCartRefs,
    MiniCartSlowViewState,
    MiniCartFastViewState,
    MiniCartInteractiveViewState
>;

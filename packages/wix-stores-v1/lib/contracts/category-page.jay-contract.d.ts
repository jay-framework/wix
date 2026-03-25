import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';
import {
    ProductCardViewState,
    ProductCardRefs,
    ProductCardRepeatedRefs,
} from './product-card.jay-contract';

export enum MediaType {
    IMAGE,
    VIDEO,
    AUDIO,
    DOCUMENT,
    ZIP,
}

export interface MainMediaOfMediaOfCategoryPageViewState {
    _id: string;
    url: string;
    altText: string;
    mediaType: MediaType;
}

export enum MediaType {
    IMAGE,
    VIDEO,
    AUDIO,
    DOCUMENT,
    ZIP,
}

export interface ThumbnailOfItemOfMediaOfCategoryPageViewState {
    url: string;
    width: number;
    height: number;
    format: string;
}

export interface ItemOfMediaOfCategoryPageViewState {
    _id: string;
    url: string;
    altText: string;
    title: string;
    mediaType: MediaType;
    thumbnail: ThumbnailOfItemOfMediaOfCategoryPageViewState;
}

export interface MediaOfCategoryPageViewState {
    mainMedia: MainMediaOfMediaOfCategoryPageViewState;
    items: Array<ItemOfMediaOfCategoryPageViewState>;
}

export interface BreadcrumbOfCategoryPageViewState {
    categoryId: string;
    categoryName: string;
    categorySlug: string;
}

export interface CategoryPageViewState {
    _id: string;
    name: string;
    description: string;
    slug: string;
    visible: boolean;
    numberOfProducts: number;
    hasImage: boolean;
    media: MediaOfCategoryPageViewState;
    breadcrumbs: Array<BreadcrumbOfCategoryPageViewState>;
    products: Array<ProductCardViewState>;
    loadedProducts: Array<ProductCardViewState>;
    hasMore: boolean;
    loadedCount: number;
    isLoading: boolean;
    hasProducts: boolean;
}

export type CategoryPageSlowViewState = Pick<
    CategoryPageViewState,
    '_id' | 'name' | 'description' | 'slug' | 'visible' | 'numberOfProducts' | 'hasImage'
> & {
    media: CategoryPageViewState['media'];
    breadcrumbs: Array<CategoryPageViewState['breadcrumbs'][number]>;
    products: Array<
        Pick<
            CategoryPageViewState['products'][number],
            | '_id'
            | 'name'
            | 'slug'
            | 'productUrl'
            | 'hasDiscount'
            | 'hasRibbon'
            | 'productType'
            | 'quickAddType'
        > & {
            mainMedia: CategoryPageViewState['products'][number]['mainMedia'];
            thumbnail: CategoryPageViewState['products'][number]['thumbnail'];
            inventory: CategoryPageViewState['products'][number]['inventory'];
            ribbon: CategoryPageViewState['products'][number]['ribbon'];
            brand: CategoryPageViewState['products'][number]['brand'];
            quickOption: Pick<
                CategoryPageViewState['products'][number]['quickOption'],
                '_id' | 'name' | 'optionRenderType'
            > & {
                choices: Array<
                    Pick<
                        CategoryPageViewState['products'][number]['quickOption']['choices'][number],
                        'choiceId' | 'name' | 'choiceType' | 'colorCode' | 'variantId'
                    >
                >;
            };
        }
    >;
};

export type CategoryPageFastViewState = Pick<
    CategoryPageViewState,
    'hasMore' | 'loadedCount' | 'isLoading' | 'hasProducts'
> & {
    products: Array<
        Pick<
            CategoryPageViewState['products'][number],
            '_id' | 'price' | 'strikethroughPrice' | 'isAddingToCart'
        > & {
            quickOption: {
                choices: Array<
                    Pick<
                        CategoryPageViewState['products'][number]['quickOption']['choices'][number],
                        'choiceId' | 'inStock' | 'isSelected'
                    >
                >;
            };
        }
    >;
    loadedProducts: Array<CategoryPageViewState['loadedProducts'][number]>;
};

export type CategoryPageInteractiveViewState = Pick<
    CategoryPageViewState,
    'hasMore' | 'loadedCount' | 'isLoading' | 'hasProducts'
> & {
    products: Array<
        Pick<
            CategoryPageViewState['products'][number],
            '_id' | 'price' | 'strikethroughPrice' | 'isAddingToCart'
        > & {
            quickOption: {
                choices: Array<
                    Pick<
                        CategoryPageViewState['products'][number]['quickOption']['choices'][number],
                        'choiceId' | 'inStock' | 'isSelected'
                    >
                >;
            };
        }
    >;
    loadedProducts: Array<CategoryPageViewState['loadedProducts'][number]>;
};

export interface CategoryPageRefs {
    loadMoreButton: HTMLElementProxy<CategoryPageViewState, HTMLButtonElement>;
    breadcrumbs: {
        categoryLink: HTMLElementCollectionProxy<
            BreadcrumbOfCategoryPageViewState,
            HTMLAnchorElement
        >;
    };
    products: ProductCardRepeatedRefs;
    loadedProducts: ProductCardRepeatedRefs;
}

export interface CategoryPageRepeatedRefs {
    loadMoreButton: HTMLElementCollectionProxy<CategoryPageViewState, HTMLButtonElement>;
    breadcrumbs: {
        categoryLink: HTMLElementCollectionProxy<
            BreadcrumbOfCategoryPageViewState,
            HTMLAnchorElement
        >;
    };
    products: ProductCardRepeatedRefs;
    loadedProducts: ProductCardRepeatedRefs;
}

export type CategoryPageContract = JayContract<
    CategoryPageViewState,
    CategoryPageRefs,
    CategoryPageSlowViewState,
    CategoryPageFastViewState,
    CategoryPageInteractiveViewState
>;

/**
 * Product Page Component (V1)
 * 
 * A complete headless product page component using Wix Catalog V1 API.
 * Handles product details, options, variants, and add to cart.
 * 
 * Key V1 differences:
 * - Uses `products` module instead of `productsV3`
 * - V1 prices are numbers, not strings
 * - V1 provides complete media URLs
 * - V1 uses `productOptions` instead of `options`
 * - V1 uses `stock` instead of `inventory`
 */

import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    SlowlyRenderResult,
    UrlParams
} from '@jay-framework/fullstack-component';
import { createMemo, createSignal, Props } from '@jay-framework/component';
import {
    ChoiceType,
    InfoSectionOfProductPageViewState,
    ModifierType,
    OptionRenderType,
    ProductPageContract,
    ProductPageFastViewState,
    ProductPageRefs,
    ProductPageSlowViewState,
    ProductType,
    StockStatus
} from '../contracts/product-page.jay-contract';
import { WIX_STORES_V1_SERVICE_MARKER, WixStoresV1Service } from '../services/wix-stores-v1-service';
import { MediaGalleryViewState, Selected } from "../contracts/media-gallery.jay-contract";
import { MediaType } from "../contracts/media.jay-contract";
import { JSONPatchOperation, patch, REPLACE } from '@jay-framework/json-patch';
import { WIX_STORES_V1_CONTEXT, WixStoresV1Context } from '../contexts/wix-stores-v1-context';
import { Product } from '@wix/auto_sdk_stores_products';

/**
 * URL parameters for product page routes
 */
export interface ProductPageParams extends UrlParams {
    slug: string;
}

interface InteractiveVariant {
    _id: string;
    sku: string;
    price: string;
    strikethroughPrice: string;
    choices: Record<string, string>;
    inventoryStatus: StockStatus;
}

interface ProductSlowCarryForward {
    productId: string;
    mediaGallery: MediaGalleryViewState;
    options: ProductPageFastViewState['options'];
    pricePerUnit: string;
    stockStatus: StockStatus;
    variants: InteractiveVariant[];
}

interface ProductFastCarryForward {
    productId: string;
    variants: InteractiveVariant[];
}

// ============================================================================
// V1 Mapping Helpers
// ============================================================================

function mapProductType(productType: string | undefined): ProductType {
    return productType === 'digital' ? ProductType.DIGITAL : ProductType.PHYSICAL;
}

function mapInfoSections(sections: Product['additionalInfoSections']): InfoSectionOfProductPageViewState[] {
    return (sections || []).map((section, index) => ({
        _id: String(index),
        title: section.title || '',
        plainDescription: section.description || '',
        uniqueName: section.title || ''
    }));
}

/**
 * Map V1 media to MediaGalleryViewState
 * V1 provides complete URLs, no need for Wix image URL formatting
 */
function mapMedia(product: Product): MediaGalleryViewState {
    const mainMedia = product.media?.mainMedia;
    const mediaItems = product.media?.items || [];

    const mainUrl = mainMedia?.image?.url || '';
    const mainThumbnail = mainMedia?.thumbnail?.url || '';
    const mainMediaType = mainMedia?.mediaType === 'video' ? MediaType.VIDEO : MediaType.IMAGE;

    return {
        selectedMedia: {
            url: mainUrl,
            mediaType: mainMediaType,
            thumbnail_50x50: mainThumbnail
        },
        availableMedia: mediaItems.map((item, index) => ({
            mediaId: item._id || String(index),
            media: {
                url: item.image?.url || '',
                mediaType: item.mediaType === 'video' ? MediaType.VIDEO : MediaType.IMAGE,
                thumbnail_50x50: item.thumbnail?.url || ''
            },
            selected: (item._id === mainMedia?._id) ? Selected.selected : Selected.notSelected
        }))
    };
}

/**
 * Map V1 productOptions to SlowViewState options
 */
function mapOptionsToSlowVS(product: Product): ProductPageSlowViewState['options'] {
    return (product.productOptions || []).map(option => ({
        _id: option.name || '',
        name: option.name || '',
        optionRenderType: option.optionType === 'color' 
            ? OptionRenderType.COLOR_SWATCH_CHOICES 
            : OptionRenderType.TEXT_CHOICES,
        choices: (option.choices || []).map(choice => ({
            choiceId: choice.value || '',
            name: choice.value || '',
            choiceType: option.optionType === 'color' ? ChoiceType.ONE_COLOR : ChoiceType.CHOICE_TEXT,
            inStock: choice.inStock ?? true,
            colorCode: ''
        }))
    }));
}

/**
 * Map V1 productOptions to FastViewState options
 */
function mapOptionsToFastVS(product: Product): ProductPageFastViewState['options'] {
    return (product.productOptions || []).map(option => ({
        _id: option.name || '',
        textChoiceSelection: undefined,
        choices: (option.choices || []).map(choice => ({
            choiceId: choice.value || '',
            isSelected: false
        }))
    }));
}

/**
 * Map V1 variants to InteractiveVariant format
 */
function mapVariants(product: Product): InteractiveVariant[] {
    return (product.variants || []).map(variant => ({
        _id: variant._id || '',
        sku: variant.variant?.sku || '',
        price: variant.variant?.priceData?.formatted?.discountedPrice || 
               variant.variant?.priceData?.formatted?.price || '',
        strikethroughPrice: (variant.variant?.priceData?.discountedPrice < variant.variant?.priceData?.price)
            ? variant.variant?.priceData?.formatted?.price || ''
            : '',
        choices: variant.choices || {},
        inventoryStatus: variant.stock?.inStock ? StockStatus.IN_STOCK : StockStatus.OUT_OF_STOCK
    }));
}

// ============================================================================
// Load Product Params for SSG
// ============================================================================

async function* loadProductParams(
    [wixStores]: [WixStoresV1Service]
): AsyncIterable<ProductPageParams[]> {
    try {
        const { items } = await wixStores.products.queryProducts().find();
        yield items.map((product) => ({ slug: product.slug || '' }));
    } catch (error) {
        console.error('[ProductPage V1] Failed to load product slugs:', error);
        yield [];
    }
}

// ============================================================================
// Rendering Functions
// ============================================================================

async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
    wixStores: WixStoresV1Service
): Promise<SlowlyRenderResult<ProductPageSlowViewState, ProductSlowCarryForward>> {

    const Pipeline = RenderPipeline.for<ProductPageSlowViewState, ProductSlowCarryForward>();

    return Pipeline
        .try(() => wixStores.products.queryProducts()
            .eq('slug', props.slug)
            .limit(1)
            .find())
        .recover(error => {
            console.error('[ProductPage V1] Error loading product:', error);
            return Pipeline.clientError(404, 'Product not found');
        })
        .toPhaseOutput(result => {
            const product = result.items?.[0];
            if (!product) {
                throw new Error('Product not found');
            }

            const variants = mapVariants(product);
            const stockStatus = product.stock?.inStock ? StockStatus.IN_STOCK : StockStatus.OUT_OF_STOCK;

            return {
                viewState: {
                    _id: product._id || '',
                    productName: product.name || '',
                    description: product.description || '',
                    brand: product.brand || '',
                    ribbon: product.ribbon || '',
                    productType: mapProductType(product.productType),
                    options: mapOptionsToSlowVS(product),
                    infoSections: mapInfoSections(product.additionalInfoSections),
                    modifiers: [], // V1 doesn't have modifiers in same format
                    seoData: { tags: [], settings: { preventAutoRedirect: false, keywords: [] } }
                },
                carryForward: {
                    productId: product._id || '',
                    mediaGallery: mapMedia(product),
                    options: mapOptionsToFastVS(product),
                    pricePerUnit: '',
                    stockStatus,
                    variants
                }
            };
        });
}

async function renderFastChanging(
    props: PageProps & ProductPageParams,
    slowCarryForward: ProductSlowCarryForward,
    wixStores: WixStoresV1Service
) {
    const Pipeline = RenderPipeline.for<ProductPageFastViewState, ProductFastCarryForward>();

    const isInStock = slowCarryForward.stockStatus === StockStatus.IN_STOCK;
    const firstVariant = slowCarryForward.variants[0];

    return Pipeline.ok({
        actionsEnabled: isInStock,
        options: slowCarryForward.options,
        modifiers: [],
        mediaGallery: slowCarryForward.mediaGallery,
        sku: firstVariant?.sku || '',
        price: firstVariant?.price || '',
        pricePerUnit: slowCarryForward.pricePerUnit,
        stockStatus: slowCarryForward.stockStatus,
        strikethroughPrice: firstVariant?.strikethroughPrice || '',
        quantity: { quantity: 1 }
    }).toPhaseOutput(viewState => ({
        viewState,
        carryForward: {
            productId: slowCarryForward.productId,
            variants: slowCarryForward.variants
        }
    }));
}

// ============================================================================
// Interactive Phase
// ============================================================================

function ProductPageInteractive(
    props: Props<PageProps & ProductPageParams>,
    refs: ProductPageRefs,
    viewStateSignals: Signals<ProductPageFastViewState>,
    fastCarryForward: ProductFastCarryForward,
    storesContext: WixStoresV1Context
) {
    const [quantity, setQuantity] = createSignal(viewStateSignals.quantity[0]().quantity);

    const { productId, variants } = fastCarryForward;
    const {
        actionsEnabled: [actionsEnabled, setActionsEnabled],
        options: [options, setOptions],
        mediaGallery: [mediaGallery, setMediaGallery],
        pricePerUnit: [pricePerUnit, setPricePerUnit]
    } = viewStateSignals;

    const [isAddingToCart, setIsAddingToCart] = createSignal(false);
    const [selectedMediaId, setSelectedMediaId] = createSignal<string | null>(null);

    // Derive selected options for variant matching
    const selectedOptionsRecord = createMemo(() => {
        const result: Record<string, string> = {};
        for (const option of options()) {
            if (option.textChoiceSelection) {
                result[option._id] = option.textChoiceSelection;
            } else {
                const selectedChoice = option.choices.find(c => c.isSelected);
                if (selectedChoice) {
                    result[option._id] = selectedChoice.choiceId;
                }
            }
        }
        return result;
    });

    function findVariant(variants: InteractiveVariant[], selectedOptions: Record<string, string>) {
        const found = variants.find(variant =>
            Object.entries(selectedOptions).every(([optionName, choiceValue]) =>
                variant.choices[optionName] === choiceValue
            )
        );
        return found || variants[0];
    }

    const selectedVariant = createMemo(() => findVariant(variants, selectedOptionsRecord()));
    const sku = createMemo(() => selectedVariant()?.sku || '');
    const price = createMemo(() => selectedVariant()?.price || '');
    const strikethroughPrice = createMemo(() => selectedVariant()?.strikethroughPrice || '');
    const stockStatus = createMemo(() => selectedVariant()?.inventoryStatus || StockStatus.OUT_OF_STOCK);
    const computedActionsEnabled = createMemo(() => stockStatus() === StockStatus.IN_STOCK);

    const interactiveMedia = createMemo((prev: MediaGalleryViewState) => {
        prev = prev || mediaGallery();
        const oldSelectedIndex = prev.availableMedia.findIndex(_ => _.selected === Selected.selected);
        const newSelectedIndex = Math.max(0, prev.availableMedia.findIndex(_ => _.mediaId === selectedMediaId()));
        if (oldSelectedIndex === newSelectedIndex) return prev;
        const newSelectedMedia = prev.availableMedia[newSelectedIndex];
        return patch(prev, [
            { op: REPLACE, path: ['selectedMedia'], value: newSelectedMedia.media },
            { op: REPLACE, path: ['availableMedia', oldSelectedIndex, 'selected'], value: Selected.notSelected },
            { op: REPLACE, path: ['availableMedia', newSelectedIndex, 'selected'], value: Selected.selected }
        ]);
    });

    // Quantity controls
    refs.quantity.decrementButton.onclick(() => {
        setQuantity(prev => Math.max(1, prev - 1));
    });

    refs.quantity.incrementButton.onclick(() => {
        setQuantity(prev => prev + 1);
    });

    refs.quantity.quantity.oninput(({ event }) => {
        const value = parseInt((event.target as HTMLInputElement).value, 10);
        if (!isNaN(value) && value > 0) {
            setQuantity(value);
        }
    });

    refs.mediaGallery?.availableMedia?.selected?.onclick(({ coordinate }) => {
        const mediaId = coordinate[0];
        setSelectedMediaId(mediaId);
    });

    refs.options?.choices?.choiceButton?.onclick(({ coordinate }) => {
        const [optionId, choiceId] = coordinate;
        const optionIndex = options().findIndex(_ => _._id === optionId);
        const option = options()[optionIndex];
        const newChoiceIndex = option.choices.findIndex(_ => _.choiceId === choiceId);
        const oldChoiceIndex = option.choices.findIndex(_ => _.isSelected);
        const removeSelectedPatch: JSONPatchOperation<ReturnType<typeof options>>[] = 
            (oldChoiceIndex > -1 && oldChoiceIndex !== newChoiceIndex)
                ? [{ op: REPLACE, path: [optionIndex, 'choices', oldChoiceIndex, 'isSelected'], value: false }]
                : [];
        setOptions(patch(options(), [
            { op: REPLACE, path: [optionIndex, 'choices', newChoiceIndex, 'isSelected'], value: true },
            ...removeSelectedPatch
        ]));
    });

    refs.options?.textChoice?.oninput(({ event, coordinate }) => {
        const [optionId] = coordinate;
        const optionIndex = options().findIndex(_ => _._id === optionId);
        const selectedChoiceId = (event.target as HTMLSelectElement).value;
        setOptions(patch(options(), [
            { op: REPLACE, path: [optionIndex, 'textChoiceSelection'], value: selectedChoiceId }
        ]));
    });

    refs.addToCartButton.onclick(async () => {
        if (stockStatus() === StockStatus.OUT_OF_STOCK) {
            console.warn('[ProductPage V1] Product is out of stock');
            return;
        }

        setIsAddingToCart(true);
        try {
            const variantId = selectedVariant()?._id;
            await storesContext.addToCart(productId, quantity(), variantId);
            console.log('[ProductPage V1] Added to cart:', quantity(), 'items');
        } catch (error) {
            console.error('[ProductPage V1] Failed to add to cart:', error);
        } finally {
            setIsAddingToCart(false);
        }
    });

    return {
        render: () => ({
            quantity: { quantity: quantity() },
            actionsEnabled: computedActionsEnabled,
            options,
            modifiers: () => [],
            mediaGallery: interactiveMedia,
            sku,
            price,
            pricePerUnit,
            stockStatus,
            strikethroughPrice
        })
    };
}

// ============================================================================
// Component Export
// ============================================================================

/**
 * Product Page Component (V1)
 *
 * A complete headless product page using Wix Catalog V1 API.
 */
export const productPage = makeJayStackComponent<ProductPageContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withContexts(WIX_STORES_V1_CONTEXT)
    .withLoadParams(loadProductParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductPageInteractive);

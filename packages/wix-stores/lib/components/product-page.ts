import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    SlowlyRenderResult,
    UrlParams
} from '@jay-framework/fullstack-component';
import {createMemo, createSignal, Props} from '@jay-framework/component';
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
    SeoDatumOfProductPageViewState,
    StockStatus
} from '../contracts/product-page.jay-contract';
import {WIX_STORES_SERVICE_MARKER, WixStoresService} from '../services';
import {
    ChoiceTypeWithLiterals,
    ConnectedModifier,
    ConnectedOption,
    InfoSection,
    Media,
    MediaTypeWithLiterals,
    ModifierRenderTypeWithLiterals,
    OptionChoice,
    SeoSchema,
    VariantsInfo
} from '@wix/auto_sdk_stores_products-v-3'
import {MediaGalleryViewState, Selected} from "../contracts/media-gallery.jay-contract";
import {MediaType} from "../contracts/media.jay-contract";
import {ADD, JSONPatchOperation, patch, REPLACE} from '@jay-framework/json-patch';
import { useGlobalContext } from '@jay-framework/runtime';
import { WIX_STORES_CONTEXT } from '../contexts/wix-stores-context.js';

/**
 * URL parameters for product page routes
 * Supports dynamic routing like /products/[slug]
 */
export interface ProductPageParams extends UrlParams {
    slug: string;
}

interface InteractiveVariant {
    _id: string,
    sku: string,
    price: string,
    strikethroughPrice: string,
    choices: OptionChoice[],
    mediaId?: string,
    inventoryStatus: StockStatus
}

/**
 * Data carried forward from slow rendering to fast rendering
 */
interface ProductSlowCarryForward {
    productId: string;
    mediaGallery: MediaGalleryViewState,
    options: ProductPageFastViewState['options'],
    modifiers: ProductPageFastViewState['modifiers'],
    pricePerUnit: string,
    stockStatus: StockStatus,
    variants: InteractiveVariant[]
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface ProductFastCarryForward {
    productId: string;
    variants: InteractiveVariant[]
}

/**
 * Load product slugs for static site generation
 * This function yields all product slugs to generate pages for.
 */
async function* loadProductParams(
    [wixStores]: [WixStoresService]
): AsyncIterable<ProductPageParams[]> {
    try {
        const { items } = await wixStores.products.queryProducts().find();
        yield items.map((product) => ({ slug: product.slug }));
    } catch (error) {
        console.error('Failed to load product slugs:', error);
        yield [];
    }
}

function mapProductType(productType: string): ProductType {
    return productType === 'DIGITAL' ? ProductType.DIGITAL : ProductType.PHYSICAL
}

function mapInfoSections(infoSections: InfoSection[]): Array<InfoSectionOfProductPageViewState> {
    return infoSections.map(infoSection => ({
        _id: infoSection._id,
        plainDescription: infoSection.plainDescription || '',
        title: infoSection.title || '',
        uniqueName: infoSection.uniqueName || '',
    }));
}
function mapSeoData(seoData: SeoSchema): SeoDatumOfProductPageViewState {
    return ({
        tags: seoData?.tags?.map((tag, index) => ({
            position: index.toString().padStart(2, '0'),
            type: tag.type,
            props: Object.entries(tag.props).map(([key, value]) => ({key, value})),
            meta: Object.entries(tag.meta).map(([key, value]) => ({key, value})),
            children: tag.children
        })),
        settings: {
            preventAutoRedirect: seoData?.settings?.preventAutoRedirect || false,
            keywords: seoData?.settings?.keywords.map(keyword => ({
                isMain: keyword.isMain,
                origin: keyword.origin,
                term: keyword.term,
            }))
        }
    });
}

function formatWixMediaUrl(_id: string, url: string, mediaType: MediaType, resize?: {w: number, h: number}) {
    const resizeFragment = resize?
        `/v1/fit/w_${resize.w},h_${resize.h},q_90/file.jpg` :
        ``;
    if (url)
        return url;
    else if (mediaType === MediaType.IMAGE)
        return `https://static.wixstatic.com/media/${_id}${resizeFragment}`
    else if (mediaType === MediaType.VIDEO)
        return `https://static.wixstatic.com/media/${_id}${resizeFragment}`
}

function mapMediaType(mediaType: MediaTypeWithLiterals): MediaType {
    if (mediaType === "VIDEO")
        return MediaType.VIDEO
    else
        return MediaType.IMAGE;
}

function mapMedia(media: Media): MediaGalleryViewState {
    const mainMediaType = mapMediaType(media.main.mediaType);
    return {
        selectedMedia: {
            url: formatWixMediaUrl(media.main._id, media.main.url, mainMediaType),
            mediaType: mainMediaType,
            thumbnail_50x50: formatWixMediaUrl(media.main._id, media.main.url, mainMediaType, {w: 50, h: 50})

        },
        availableMedia: media.itemsInfo?.items?.map(item => ({
            mediaId: item._id,
            media: {
                url: formatWixMediaUrl(item._id, item.url, mainMediaType),
                mediaType: (item.mediaType === 'IMAGE'? MediaType.IMAGE : MediaType.VIDEO),
                thumbnail_50x50: formatWixMediaUrl(item._id, item.url, mainMediaType, {w: 50, h: 50})
            },
            selected: (item._id === media.main._id)? Selected.selected : Selected.notSelected
        })) ?? [],
    };
}

function mapOptionsToSlowVS(options: ConnectedOption[]): ProductPageSlowViewState['options'] {
    return options?.map(option => ({
        name: option.name,
        optionRenderType: (option.optionRenderType === 'TEXT_CHOICES'? OptionRenderType.TEXT_CHOICES : OptionRenderType.COLOR_SWATCH_CHOICES),
        _id: option._id,
        choices: option.choicesSettings?.choices?.map((choice) => ({
            name: choice.name,
            choiceId: choice.choiceId,
            choiceType: (choice.choiceType === 'CHOICE_TEXT'? ChoiceType.CHOICE_TEXT : ChoiceType.ONE_COLOR),
            inStock: choice.inStock,
            colorCode: choice.colorCode,
        })) ?? [],
    })) ?? [];
}

function mapOptionsToFastVS(options: ConnectedOption[]): ProductPageFastViewState['options'] {
    return options?.map(option => ({
        _id: option._id,
        textChoiceSelection: undefined,
        choices: option.choicesSettings?.choices?.map((choice) => ({
            choiceId: choice.choiceId,
            isSelected: false
        })) ?? [],
    })) ?? [];
}

function mapModifierType(modifierRenderType: ModifierRenderTypeWithLiterals): ModifierType {
    switch (modifierRenderType) {
        case "FREE_TEXT": return ModifierType.FREE_TEXT
        case "TEXT_CHOICES": return ModifierType.TEXT_CHOICES
        case "SWATCH_CHOICES": return ModifierType.COLOR_SWATCH_CHOICES
        default: return ModifierType.FREE_TEXT
    }
}

function mapModifierChoiceType(choiceType: ChoiceTypeWithLiterals): ChoiceType {
    if (choiceType === "ONE_COLOR")
        return ChoiceType.ONE_COLOR
    else
        return ChoiceType.CHOICE_TEXT
}

function mapModifiersToSlowVS(modifiers: ConnectedModifier[]): ProductPageSlowViewState['modifiers'] {
    return modifiers?.map(modifier => ({
        name: modifier.name || modifier.freeTextSettings?.title || '',
        _id: modifier._id,
        modifierType: mapModifierType(modifier.modifierRenderType),
        textInputLength: modifier.freeTextSettings?.maxCharCount,
        textInputRequired: modifier.mandatory,
        choices: modifier.choicesSettings?.choices?.map((choice) => ({
            name: choice.name,
            choiceId: choice.choiceId,
            colorCode: choice.colorCode,
            choiceType: mapModifierChoiceType(choice.choiceType)
        })) ?? []
    })) ?? [];
}

function mapModifiersToFastVS(modifiers: ConnectedModifier[]): ProductPageFastViewState['modifiers'] {
    return modifiers?.map(modifier => ({
        _id: modifier._id,
        textModifierSelection: undefined,
        choices: modifier.choicesSettings?.choices?.map((choice) => ({
            choiceId: choice.choiceId,
            isSelected: false
        })) ?? []
    })) ?? [];
}

function mapVariants(variantsInfo: VariantsInfo): InteractiveVariant[]{
    return variantsInfo?.variants.map(variant => ({
        _id: variant._id,
        choices: variant.choices,
        sku: variant.sku,
        price: variant.price.actualPrice.formattedAmount,
        inventoryStatus: variant.inventoryStatus.inStock? StockStatus.IN_STOCK : StockStatus.OUT_OF_STOCK,
        mediaId: variant.media?._id,
        strikethroughPrice: variant.price.compareAtPrice?.formattedAmount || ''
    })) || [];
}

/**
 * Slow Rendering Phase
 * Loads semi-static product data that doesn't change often:
 * - Product details (name, description, SKU)
 * - Media (images, videos)
 * - Options and variants
 * - Categories and breadcrumbs
 * - Brand and metadata
 */
async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
    wixStores: WixStoresService
): Promise<SlowlyRenderResult<ProductPageSlowViewState, ProductSlowCarryForward>> {

    const Pipeline = RenderPipeline.for<ProductPageSlowViewState, ProductSlowCarryForward>()

    return Pipeline
        .try(() => wixStores.products.getProductBySlug(props.slug, {
            fields: ['INFO_SECTION', 'INFO_SECTION_PLAIN_DESCRIPTION', 'MEDIA_ITEMS_INFO', 'PLAIN_DESCRIPTION', 'CURRENCY']
        }))
        .recover(error => {
            console.log('product page error', error)
            return Pipeline.clientError(404, 'not found')
        })
        .toPhaseOutput(getProductResponse => {
            console.log('product\n', JSON.stringify(getProductResponse.product, null, 2))
            const product = getProductResponse.product;
            const { _id, name, plainDescription, options, modifiers, actualPriceRange, compareAtPriceRange, media, productType,
                brand, ribbon, infoSections, seoData, physicalProperties, inventory, variantsInfo} = product
            return ({
                viewState: {
                    _id: _id,
                    productName: name || '',
                    description: plainDescription,
                    brand: brand?.name || '',
                    ribbon: ribbon?.name || '',
                    productType: mapProductType(productType),
                    options: mapOptionsToSlowVS(options),
                    infoSections: mapInfoSections(infoSections),
                    modifiers: mapModifiersToSlowVS(modifiers),
                    seoData: mapSeoData(seoData),
                },
                carryForward: {
                    productId: _id,
                    mediaGallery: mapMedia(media),
                    options: mapOptionsToFastVS(options),
                    modifiers: mapModifiersToFastVS(modifiers),
                    sku: 'N/A not in API',
                    price: actualPriceRange?.minValue?.formattedAmount || '',
                    strikethroughPrice:
                        actualPriceRange?.minValue?.amount !== product.compareAtPriceRange?.minValue?.amount ?
                            compareAtPriceRange?.minValue?.formattedAmount || '' : '',
                    pricePerUnit: physicalProperties?.pricePerUnitRange?.minValue?.description,
                    stockStatus: (inventory?.availabilityStatus === 'IN_STOCK' ? StockStatus.IN_STOCK : StockStatus.OUT_OF_STOCK),
                    variants: mapVariants(variantsInfo)
                }
            });
        })
}

/**
 * Fast Rendering Phase
 * Loads frequently changing data:
 * - Real-time inventory status
 * - Current variant availability
 * - Dynamic pricing (if applicable)
 * 
 * Note: slowCarryForward is injected as the FIRST SERVICE parameter
 */
async function renderFastChanging(
    props: PageProps & ProductPageParams,
    slowCarryForward: ProductSlowCarryForward,
    wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<ProductPageFastViewState, ProductFastCarryForward>()

    // Determine if actions should be enabled based on stock status
    const isInStock = slowCarryForward.stockStatus === StockStatus.IN_STOCK;
    
    return Pipeline.ok({
            actionsEnabled: isInStock,
            options: slowCarryForward.options,
            modifiers: slowCarryForward.modifiers,
            mediaGallery: slowCarryForward.mediaGallery,
            sku: slowCarryForward.variants[0].sku,
            price: slowCarryForward.variants[0].price,
            pricePerUnit: slowCarryForward.pricePerUnit || '',
            stockStatus: slowCarryForward.stockStatus,
            strikethroughPrice: slowCarryForward.variants[0].strikethroughPrice,
            quantity: { quantity: 1}
        }
    ).toPhaseOutput(viewState => ({
        viewState,
        carryForward: {
            productId: slowCarryForward.productId,
            variants: slowCarryForward.variants
        }
    }))
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Variant/option selection
 * - Quantity adjustments
 * - Add to cart action
 * 
 * Parameter order:
 * 1. props - from withProps() + URL params (NOT including carry forward)
 * 2. refs - interactive elements from contract
 * 3. viewStateSignals - Signals<FastViewState> (reactive access to fast-phase data)
 * 4. fastCarryForward - carry forward from fast render (first context)
 */
function ProductPageInteractive(
    props: Props<PageProps & ProductPageParams>,
    refs: ProductPageRefs,
    viewStateSignals: Signals<ProductPageFastViewState>,
    fastCarryForward: ProductFastCarryForward
) {
    // Get the stores context for cart operations
    const storesContext = useGlobalContext(WIX_STORES_CONTEXT);

    const [quantity, setQuantity] = createSignal(viewStateSignals.quantity[0]().quantity)

    const {productId, variants} = fastCarryForward;
    const {
        actionsEnabled: [actionsEnabled, setActionsEnabled],
        options: [options, setOptions],
        modifiers: [modifiers, setModifiers],
        mediaGallery: [mediaGallery, setMediaGallery],
        // sku: [sku, setSKU],
        // price: [price, setPrice],
        // stockStatus: [stockStatus, setStockStatus],
        pricePerUnit: [pricePerUnit, setPricePerUnit]
    } = viewStateSignals;


    const [isAddingToCart, setIsAddingToCart] = createSignal(false);

    const [selectedOptions, setSelectedOptions] = createSignal<Record<string, string>>({});
    const [selectedMediaId, setSelectedMediaId] = createSignal<string>(null);
    const selectedVariant = createMemo(() => findVariant(variants, selectedOptions()))
    const sku = createMemo(() => selectedVariant().sku)
    const price = createMemo(() => selectedVariant().price)
    const strikethroughPrice = createMemo(() => selectedVariant().strikethroughPrice)
    const stockStatus = createMemo(() => selectedVariant().inventoryStatus)
    
    // Actions are enabled when the selected variant is in stock
    const computedActionsEnabled = createMemo(() => stockStatus() === StockStatus.IN_STOCK)

    const interactiveMedia = createMemo((prev: MediaGalleryViewState) => {
        prev = prev || mediaGallery();
        const oldSelectedMediaIndex = prev.availableMedia.findIndex(_ => _.selected === Selected.selected);
        const newSelectedMediaIndex = Math.max(0, prev.availableMedia.findIndex(_ => _.mediaId === selectedMediaId()));
        if (oldSelectedMediaIndex === newSelectedMediaIndex)
            return prev;
        const newSelectedMedia = prev.availableMedia[newSelectedMediaIndex];
        return patch(prev, [
            { op: REPLACE, path: ['selectedMedia'], value: newSelectedMedia.media},
            { op: REPLACE, path: ['availableMedia', oldSelectedMediaIndex, 'selected'], value: Selected.notSelected},
            { op: REPLACE, path: ['availableMedia', newSelectedMediaIndex, 'selected'], value: Selected.selected},
        ])
    })
    // Quantity controls
    refs.quantity.decrementButton.onclick(() => {
        setQuantity(prev => Math.max(1, prev - 1));
    });

    refs.quantity.incrementButton.onclick(() => {
        setQuantity(prev => prev + 1);
    });

    refs.quantity.quantity.oninput(({event}) => {
        const value = parseInt((event.target as HTMLInputElement).value, 10);
        if (!isNaN(value) && value > 0) {
            setQuantity(value);
        }
    });

    function findVariant(variants: InteractiveVariant[], options: Record<string, string>) {
        const foundFullMatch = variants.find(variant =>
            variant.choices.every(choice => options[choice.optionChoiceIds.optionId] === choice.optionChoiceIds.choiceId)
        )
        if (foundFullMatch && foundFullMatch.mediaId)
            setSelectedMediaId(foundFullMatch.mediaId);
        return foundFullMatch || variants[0];
    }

    refs.mediaGallery.availableMedia.selected.onclick(({coordinate}) => {
        const mediaId = coordinate[0];
        setSelectedMediaId(mediaId);
    })

    refs.options.choices.choiceButton.onclick(({event, viewState, coordinate}) => {
        const [optionId, choiceId] = coordinate;
        const optionIndex = options().findIndex(_ => _._id === optionId)
        const option = options()[optionIndex];
        const newChoiceIndex = option.choices.findIndex(_ => _.choiceId === choiceId);
        const oldChoiceIndex = option.choices.findIndex(_ => _.isSelected);
        const removeSelectedPatch: JSONPatchOperation<ReturnType<typeof options>>[] = (oldChoiceIndex > -1 && oldChoiceIndex !== newChoiceIndex) ?
            [{ op: REPLACE, path: [optionIndex, 'choices', oldChoiceIndex, 'isSelected'], value: false }]: []
        setOptions(patch(options(), [
            { op: REPLACE, path: [optionIndex, 'choices', newChoiceIndex, 'isSelected'], value: true },
            ...removeSelectedPatch
        ]))
        setSelectedOptions(patch(selectedOptions(), [
            {op: ADD, path: [optionId], value: choiceId}
        ]))
    });

    refs.options.textChoice.oninput(({event, viewState, coordinate}) => {
        const [optionId, choiceId] = coordinate;
        const optionIndex = options().findIndex(_ => _._id === optionId)
        const textValue = (event.target as HTMLSelectElement).value;
        setOptions(patch(options(), [
            { op: REPLACE, path: [optionIndex, 'textChoiceSelection'], value: textValue },
        ]))
        setSelectedOptions(patch(selectedOptions(), [
            {op: ADD, path: [optionId], value: choiceId}
        ]))
    });

    refs.modifiers.choices.choiceButton.onclick(({event, viewState, coordinate}) => {
        const [modifierId, choiceId] = coordinate;
        const modifierIndex = modifiers().findIndex(_ => _._id === modifierId)
        const modifier = modifiers()[modifierIndex];
        const newChoiceIndex = modifier.choices.findIndex(_ => _.choiceId === choiceId);
        const oldChoiceIndex = modifier.choices.findIndex(_ => _.isSelected);
        const removeSelectedPatch: JSONPatchOperation<ReturnType<typeof modifiers>>[] = (oldChoiceIndex > -1 && oldChoiceIndex !== newChoiceIndex) ?
            [{ op: REPLACE, path: [modifierIndex, 'choices', oldChoiceIndex, 'isSelected'], value: false }]: []
        setModifiers(patch(modifiers(), [
            { op: REPLACE, path: [modifierIndex, 'choices', newChoiceIndex, 'isSelected'], value: true },
            ...removeSelectedPatch
        ]))

    })

    refs.modifiers.textInput.oninput(({event, viewState, coordinate}) => {
        const [modifierId] = coordinate;
        const modifierIndex = modifiers().findIndex(_ => _._id === modifierId)
        const textValue = (event.target as HTMLInputElement).value;
        setModifiers(patch(modifiers(), [
            { op: REPLACE, path: [modifierIndex, 'textModifierSelection'], value: textValue },
        ]))
    })

    refs.modifiers.textModifier.oninput(({event, viewState, coordinate}) => {
        const [modifierId, choiceId] = coordinate;
        const modifierIndex = modifiers().findIndex(_ => _._id === modifierId)
        const textValue = (event.target as HTMLSelectElement).value;
        setModifiers(patch(modifiers(), [
            { op: REPLACE, path: [modifierIndex, 'textModifierSelection'], value: textValue },
        ]))
    });

    refs.addToCartButton.onclick(async () => {
        if (stockStatus() === StockStatus.OUT_OF_STOCK) {
            console.warn('Product is out of stock');
            return;
        }

        setIsAddingToCart(true);
        try {
            // Add to cart using the client context
            await storesContext.cart.addToCurrentCart({
                lineItems: [{
                    catalogReference: {
                        catalogItemId: fastCarryForward.productId,
                        appId: '1380b703-ce81-ff05-f115-39571d94dfcd', // Wix Stores app ID
                    },
                    quantity: quantity()
                }]
            });

            // Get updated cart to dispatch event
            const cart = await storesContext.cart.getCurrentCart();
            const itemCount = (cart?.lineItems || []).reduce(
                (sum: number, item: { quantity?: number }) => sum + (item.quantity || 0),
                0
            );
            
            console.log('Added to cart:', quantity(), 'items');
            
            // Dispatch cart update event for cart indicator
            window.dispatchEvent(new CustomEvent('wix-cart-updated', {
                detail: {
                    itemCount,
                    hasItems: itemCount > 0,
                    subtotal: { amount: '0', formattedAmount: '', currency: 'USD' }
                }
            }));
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setIsAddingToCart(false);
        }
    });

    return {
        render: () => ({
            quantity: {
                quantity: quantity(),
            },
            actionsEnabled: computedActionsEnabled,
            options,
            modifiers,
            mediaGallery: interactiveMedia,
            sku,
            price,
            pricePerUnit,
            stockStatus,
            strikethroughPrice,
        })
    };
}

/**
 * Product Page Full-Stack Component
 * 
 * A complete headless product page component with server-side rendering,
 * real-time inventory, and client-side interactivity.
 * 
 * Usage:
 * ```typescript
 * import { productPage } from '@jay-framework/wix-stores';
 * 
 * // The component will automatically load products and render pages
 * ```
 */
export const productPage = makeJayStackComponent<ProductPageContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withLoadParams(loadProductParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductPageInteractive);


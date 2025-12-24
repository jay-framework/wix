import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    SlowlyRenderResult,
    UrlParams
} from '@jay-framework/fullstack-component';
import {createSignal, Props} from '@jay-framework/component';
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
import {WIX_STORES_SERVICE_MARKER, WixStoresService} from '../stores-client/wix-stores-service';
import {
    ChoiceTypeWithLiterals,
    ConnectedModifier,
    ConnectedOption,
    InfoSection,
    Media,
    MediaTypeWithLiterals,
    ModifierRenderTypeWithLiterals,
    SeoSchema,
    VariantsInfo
} from '@wix/auto_sdk_stores_products-v-3'
import {MediaGalleryViewState, Selected} from "../contracts/media-gallery.jay-contract";
import {MediaType} from "../contracts/media.jay-contract";
import {JSONPatchOperation, patch, REPLACE} from '@jay-framework/json-patch';

/**
 * URL parameters for product page routes
 * Supports dynamic routing like /products/[slug]
 */
export interface ProductPageParams extends UrlParams {
    slug: string;
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
    variantsInfo: VariantsInfo
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface ProductFastCarryForward {
    productId: string;
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
                    variantsInfo
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

    return Pipeline.ok({
            actionsEnabled: false,
            options: slowCarryForward.options,
            modifiers: slowCarryForward.modifiers,
            mediaGallery: slowCarryForward.mediaGallery,
            sku: slowCarryForward.variantsInfo.variants[0].sku,
            price: slowCarryForward.variantsInfo.variants[0].price.actualPrice.formattedAmount,
            pricePerUnit: slowCarryForward.pricePerUnit,
            stockStatus: slowCarryForward.stockStatus,
            strikethroughPrice: slowCarryForward.variantsInfo.variants[0].price.compareAtPrice?.formattedAmount || '',
            quantity: { quantity: 1}
        }
    ).toPhaseOutput(viewState => ({
        viewState,
        carryForward: {
            productId: slowCarryForward.productId
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

    const [quantity, setQuantity] = createSignal(viewStateSignals.quantity[0]().quantity)

    const {
        actionsEnabled: [actionsEnabled, setActionsEnabled],
        options: [options, setOptions],
        modifiers: [modifiers, setModifiers],
        mediaGallery: [mediaGallery, setMediaGallery],
        sku: [sku, setSKU],
        price: [price, setPrice],
        stockStatus: [stockStatus, setStockStatus],
        strikethroughPrice: [strikethroughPrice, setStrikethroughPrice]
    } = viewStateSignals;

    const pricePerUnit = "5";

    const [isAddingToCart, setIsAddingToCart] = createSignal(false);
    const [selectedChoices, setSelectedChoices] = createSignal<Map<string, string>>(new Map());

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

    refs.mediaGallery.availableMedia.selected.onclick(({coordinate}) => {
        const mediaId = coordinate[0];
        const oldSelectedMediaIndex = mediaGallery().availableMedia.findIndex(_ => _.selected === Selected.selected);
        const newSelectedMediaIndex = mediaGallery().availableMedia.findIndex(_ => _.mediaId === mediaId);
        if (oldSelectedMediaIndex === newSelectedMediaIndex)
            return;
        const newSelectedMedia = mediaGallery().availableMedia[newSelectedMediaIndex];
        setMediaGallery(patch(mediaGallery(), [
            { op: REPLACE, path: ['selectedMedia'], value: newSelectedMedia.media},
            { op: REPLACE, path: ['availableMedia', oldSelectedMediaIndex, 'selected'], value: Selected.notSelected},
            { op: REPLACE, path: ['availableMedia', newSelectedMediaIndex, 'selected'], value: Selected.selected},
        ]))
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
    });

    refs.options.textChoice.oninput(({event, viewState, coordinate}) => {
        const [optionId, choiceId] = coordinate;
        const optionIndex = options().findIndex(_ => _._id === optionId)
        const textValue = (event.target as HTMLSelectElement).value;
        setOptions(patch(options(), [
            { op: REPLACE, path: [optionIndex, 'textChoiceSelection'], value: textValue },
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

    // Handle add to cart
    refs.addToCartButton.onclick(async () => {
        if (stockStatus() === StockStatus.OUT_OF_STOCK) {
            console.warn('Product is out of stock');
            return;
        }

        setIsAddingToCart(true);
        try {
            // TODO: Implement cart API call
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('Adding to cart:', {
                productId: fastCarryForward.productId,
                quantity: quantity(),
                selectedChoices: Array.from(selectedChoices().entries())
            });
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
            actionsEnabled,
            options,
            modifiers,
            mediaGallery,
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


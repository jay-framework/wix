import {
    makeJayStackComponent,
    notFound,
    PageProps,
    partialRender,
    SlowlyRenderResult,
    UrlParams
} from '@jay-framework/fullstack-component';
import {createSignal, Props} from '@jay-framework/component';
import {
    InfoSectionOfProductPageViewState,
    ModifierOfProductPageViewState,
    OptionOfProductPageViewState,
    ProductPageContract,
    ProductPageRefs,
    ProductPageViewState,
    ProductType,
    QuantityOfProductPageViewState,
    SeoDatumOfProductPageViewState,
    StockStatus
} from '../contracts/product-page.jay-contract';
import {WixStoresContext, WixStoresContextMarker} from './wix-stores-context';
import {InfoSection, Media, MediaTypeWithLiterals, SeoSchema} from '@wix/auto_sdk_stores_products-v-3'
import {MediaGalleryViewState} from "../contracts/media-gallery.jay-contract";
import {MediaType} from "../contracts/media.jay-contract";

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
    options: Array<OptionOfProductPageViewState>,
    quantity: QuantityOfProductPageViewState,
    stockStatus: StockStatus,
    modifiers: Array<ModifierOfProductPageViewState>,
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface ProductFastCarryForward extends ProductSlowCarryForward {
    inStock: boolean;
    preorderEnabled: boolean;
}

export type SlowRenderedProduct = Omit<ProductPageViewState,
    "mediaGallery" | "sku" | "options" | "stockStatus" | "modifiers" | "price" | "strikethroughPrice" | "actionsEnabled" | "quantity">

/**
 * Load product slugs for static site generation
 * This function yields all product slugs to generate pages for.
 */
async function* loadProductParams(
    [wixStores]: [WixStoresContext]
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
        id: infoSection._id,
        plainDescription: infoSection.plainDescription || '',
        title: infoSection.title || '',
        uniqueName: infoSection.uniqueName || '',
    }));
}
function mapSeoData(seoData: SeoSchema): SeoDatumOfProductPageViewState {
    return ({
        tags: seoData.tags.map(tag => ({
            type: tag.type,
            props: Object.entries(tag.props).map(([key, value]) => ({key, value})),
            meta: Object.entries(tag.meta).map(([key, value]) => ({key, value})),
            children: tag.children
        })),
        settings: {
            preventAutoRedirect: seoData.settings?.preventAutoRedirect || false,
            keywords: seoData.settings.keywords.map(keyword => ({
                isMain: keyword.isMain,
                origin: keyword.origin,
                term: keyword.term,
            }))
        }
    });
}

function formatWixMediaUrl(_id: string, url: string, mediaType: MediaType, resize?: {w: number, h: number}) {
    if (url)
        return url;
    else if (mediaType === MediaType.IMAGE)
        return `https://static.wixstatic.com/media/${_id}`
    else if (mediaType === MediaType.VIDEO)
        return `https://static.wixstatic.com/media/${_id}`
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
        availableMedia: ,
    };
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
    wixStores: WixStoresContext
): Promise<SlowlyRenderResult<SlowRenderedProduct, ProductSlowCarryForward>> {
    try {
        // Query product by slug with required fields
        const { product } = await wixStores.products
            .getProductBySlug(props.slug);
        const { _id, name, plainDescription, actualPriceRange, compareAtPriceRange, currency, media, productType, handle,
            visible, visibleInPos, brand, ribbon, mainCategoryId, breadcrumbsInfo,
            allCategoriesInfo, directCategoriesInfo, infoSections, seoData, physicalProperties, taxGroupId, variantSummary, _createdDate, _updatedDate, revision} = product

        return partialRender(
            {
                id: _id,
                productName: name || '',
                description: plainDescription,
                brand: brand?.name || '',
                ribbon: ribbon?.name || '',
                productType: mapProductType(productType),
                infoSections: mapInfoSections(infoSections),
                seoData: mapSeoData(seoData),
                pricePerUnit: physicalProperties?.pricePerUnitRange?.minValue?.description,
            },
            {
                productId: product._id || '',
                mediaGallery: mapMedia(media),
                options: Array<OptionOfProductPageViewState>,
                quantity: QuantityOfProductPageViewState,
                stockStatus: StockStatus,
                modifiers: Array<ModifierOfProductPageViewState>,
            }
        );
    } catch (error) {
        console.error('Failed to render product page (slow):', error);
        return notFound();
    }
}

/**
 * Fast Rendering Phase
 * Loads frequently changing data:
 * - Real-time inventory status
 * - Current variant availability
 * - Dynamic pricing (if applicable)
 */
async function renderFastChanging(
    props: PageProps & ProductPageParams,
    carryForward: ProductSlowCarryForward,
    wixStores: WixStoresContext
) {
    try {
        // Get current inventory status
        let inStock = false;
        let preorderEnabled = false;
        
        try {
            const inventoryResponse = await wixStores.inventory.getInventoryItem({
                filter: { productId: carryForward.productId }
            });
            const hasInventory = inventoryResponse.items && inventoryResponse.items.length > 0;
            const firstItem = inventoryResponse.items?.[0];
            
            inStock = hasInventory && (firstItem?.availableQuantity || 0) > 0;
            preorderEnabled = firstItem?.preorderInfo?.enabled || false;
        } catch (invError) {
            console.warn('Inventory query failed:', invError);
        }

        return partialRender(
            {
                inventory: {
                    availabilityStatus: inStock ? AvailabilityStatus.IN_STOCK : AvailabilityStatus.OUT_OF_STOCK,
                    preorderStatus: preorderEnabled ? PreorderStatus.ENABLED : PreorderStatus.DISABLED,
                    preorderAvailability: PreorderAvailability.NO_VARIANTS
                }
            },
            {
                productId: carryForward.productId,
                slug: carryForward.slug,
                inStock,
                preorderEnabled
            }
        );
    } catch (error) {
        console.error('Failed to render product page (fast):', error);
        // Return default inventory state on error
        return partialRender(
            {
                inventory: {
                    availabilityStatus: AvailabilityStatus.OUT_OF_STOCK,
                    preorderStatus: PreorderStatus.DISABLED,
                    preorderAvailability: PreorderAvailability.NO_VARIANTS
                }
            },
            {
                productId: carryForward.productId,
                slug: carryForward.slug,
                inStock: false,
                preorderEnabled: false
            }
        );
    }
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Variant/option selection
 * - Quantity adjustments
 * - Add to cart action
 */
function ProductPageInteractive(
    props: Props<PageProps & ProductPageParams & ProductFastCarryForward>,
    refs: ProductPageRefs
) {
    const [quantity, setQuantity] = createSignal(1);
    const [isAddingToCart, setIsAddingToCart] = createSignal(false);
    const [selectedChoices, setSelectedChoices] = createSignal<Map<string, string>>(new Map());

    // Quantity controls
    refs.quantity.decrementButton.onclick(() => {
        setQuantity(prev => Math.max(1, prev - 1));
    });

    refs.quantity.incrementButton.onclick(() => {
        setQuantity(prev => prev + 1);
    });

    refs.quantity.quantityInput.oninput(({event}) => {
        const value = parseInt((event.target as HTMLInputElement).value, 10);
        if (!isNaN(value) && value > 0) {
            setQuantity(value);
        }
    });

    // Handle option choice selection
    refs.options.choices.choiceButton.onclick(({event, viewState, coordinate}) => {
        const choices = new Map(selectedChoices());
        const [optionId, choiceId] = coordinate;
        choices.set(optionId, choiceId);
        setSelectedChoices(choices);
    });

    // Handle add to cart
    refs.addToCartButton.onclick(async () => {
        if (!props.inStock()) {
            console.warn('Product is out of stock');
            return;
        }

        setIsAddingToCart(true);
        try {
            // TODO: Implement cart API call
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('Adding to cart:', {
                productId: props.productId(),
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
            isAddingToCart: isAddingToCart(),
            quantity: {
                currentQuantity: quantity(),
                quantityInput: quantity()
            },
            options: refs.options.map((option) => ({
                choices: option.choices.map((choice) => ({
                    isSelected: selectedChoices().get(option._id) === choice.choiceId
                }))
            }))
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
    .withServerContext(WixStoresContextMarker)
    .withLoadParams(loadProductParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductPageInteractive);


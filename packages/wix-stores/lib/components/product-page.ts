import { 
    makeJayStackComponent, 
    PageProps, 
    partialRender, 
    UrlParams,
    notFound 
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import { 
    ProductPageContract, 
    ProductPageRefs, 
    AvailabilityStatus, 
    PreorderStatus, 
    PreorderAvailability,
    MediaType,
    OptionRenderType,
    ChoiceType,
    ProductType
} from '../contracts/product-page.jay-contract';
import { WixStoresContext, WixStoresContextMarker } from './wix-stores-context';

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
    slug: string;
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface ProductFastCarryForward extends ProductSlowCarryForward {
    inStock: boolean;
    preorderEnabled: boolean;
}

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
) {
    try {
        // Query product by slug with required fields
        const { product } = await wixStores.products
            .getProductBySlug(props.slug);


        // Map product data to view state
        return partialRender(
            {
                _id: product._id || '',
                name: product.name || '',
                slug: product.slug || '',
                description: product.plainDescription || (typeof product.description === 'string' ? product.description : ''),
                plainDescription: product.plainDescription || (typeof product.description === 'string' ? product.description : ''),
                actualPriceRange: {
                    minValue: {
                        amount: product.actualPriceRange?.minValue?.amount || '0',
                        formattedAmount: product.actualPriceRange?.minValue?.formattedAmount || '$0.00'
                    },
                    maxValue: {
                        amount: product.actualPriceRange?.maxValue?.amount || '0',
                        formattedAmount: product.actualPriceRange?.maxValue?.formattedAmount || '$0.00'
                    }
                },
                compareAtPriceRange: product.compareAtPriceRange ? {
                    minValue: {
                        amount: product.compareAtPriceRange.minValue?.amount || '0',
                        formattedAmount: product.compareAtPriceRange.minValue?.formattedAmount || ''
                    },
                    maxValue: {
                        amount: product.compareAtPriceRange.maxValue?.amount || '0',
                        formattedAmount: product.compareAtPriceRange.maxValue?.formattedAmount || ''
                    }
                } : undefined,
                currency: product.currency || 'USD',
                media: {
                    main: product.media?.itemsInfo?.items?.[0] ? {
                        id: product.media.itemsInfo.items[0]._id || '',
                        url: product.media.itemsInfo.items[0].url || '',
                        altText: product.media.itemsInfo.items[0].altText || '',
                        mediaType: product.media.itemsInfo.items[0].mediaType === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE,
                        displayName: product.media.itemsInfo.items[0].displayName || ''
                    } : undefined,
                    itemsInfo: {
                        items: product.media?.itemsInfo?.items?.map((item) => ({
                            id: item._id || '',
                            url: item.url || '',
                            altText: item.altText || '',
                            mediaType: item.mediaType === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE,
                            displayName: item.displayName || '',
                            thumbnail: item.thumbnail ? [{
                                url: item.thumbnail.url || '',
                                altText: item.thumbnail.altText || '',
                                width: item.thumbnail.width || 0,
                                height: item.thumbnail.height || 0
                            }] : []
                        })) || []
                    }
                },
                productType: product.productType === 'DIGITAL' ? ProductType.DIGITAL : ProductType.PHYSICAL,
                handle: product.slug || '',
                visible: product.visible !== false,
                visibleInPos: false,
                url: `/products/${product.slug}`,
                _createdDate: product._createdDate?.toString() || '',
                _updatedDate: product._updatedDate?.toString() || '',
                revision: product.revision || '1',
                options: product.options?.map((option) => ({
                    id: option._id || '',
                    name: option.name || '',
                    optionRenderType: option.optionRenderType === 'SWATCH_CHOICES' ? OptionRenderType.SWATCH_CHOICES : OptionRenderType.TEXT_CHOICES,
                    choices: option.choicesSettings?.choices?.map((choice) => ({
                        choiceId: choice.choiceId || '',
                        name: choice.name || '',
                        choiceType: choice.choiceType === 'ONE_COLOR' ? ChoiceType.ONE_COLOR :
                                   choice.choiceType === 'MULTIPLE_COLORS' ? ChoiceType.MULTIPLE_COLORS :
                                   choice.choiceType === 'IMAGE' ? ChoiceType.IMAGE :
                                   ChoiceType.CHOICE_TEXT,
                        inStock: choice.inStock !== false,
                        visible: choice.visible !== false,
                        colorCode: (choice as any).colorCode || '',
                        isSelected: false
                    })) || []
                })) || []
            },
            {
                productId: product._id || '',
                slug: product.slug || ''
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
            const inventoryResponse = await (wixStores.inventory as any).queryInventory({
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


import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import {
    ProductSpotlightContract,
    ProductSpotlightFastViewState,
    ProductSpotlightInteractiveViewState,
    ProductSpotlightRefs,
    ProductSpotlightSlowViewState,
} from '../contracts/product-spotlight.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';
import { handleError } from '../utils/wix-error-handler';
import { getProductBySlug } from '../actions/stores-actions.js';
import { ProductCardViewState, QuickAddType } from '../contracts/product-card.jay-contract';

export interface ProductSpotlightProps {
    slug: string;
}

interface SpotlightCarryForward {
    product: ProductCardViewState;
}

async function renderSlowlyChanging(
    props: PageProps & ProductSpotlightProps,
    _wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<ProductSpotlightSlowViewState, SpotlightCarryForward>();

    return Pipeline.try(async () => {
        if (!props.slug) {
            throw new Error('No product slug provided');
        }
        const card = await getProductBySlug({ slug: props.slug });
        if (!card) {
            throw new Error(`Product not found: ${props.slug}`);
        }
        return card;
    })
        .recover((error) => {
            return handleError(error);
        })
        .toPhaseOutput((product) => {
            return {
                viewState: {
                    hasProduct: true,
                    product: {
                        _id: product._id,
                        name: product.name,
                        slug: product.slug,
                        productUrl: product.productUrl,
                        categoryPrefix: product.categoryPrefix,
                        mainMedia: product.mainMedia,
                        thumbnail: product.thumbnail,
                        hasDiscount: product.hasDiscount,
                        inventory: product.inventory,
                        ribbon: product.ribbon,
                        hasRibbon: product.hasRibbon,
                        brand: product.brand,
                        productType: product.productType,
                        quickAddType: product.quickAddType,
                        quickOption: {
                            _id: product.quickOption?._id,
                            name: product.quickOption?.name,
                            optionRenderType: product.quickOption?.optionRenderType,
                            choices: (product.quickOption?.choices ?? []).map((c) => ({
                                choiceId: c.choiceId,
                                name: c.name,
                                choiceType: c.choiceType,
                                colorCode: c.colorCode,
                            })),
                        },
                        secondQuickOption: {
                            _id: product.secondQuickOption?._id,
                            name: product.secondQuickOption?.name,
                            optionRenderType: product.secondQuickOption?.optionRenderType,
                            choices: (product.secondQuickOption?.choices ?? []).map((c) => ({
                                choiceId: c.choiceId,
                                name: c.name,
                                choiceType: c.choiceType,
                                colorCode: c.colorCode,
                            })),
                        },
                    },
                },
                carryForward: { product },
            };
        });
}

async function renderFastChanging(
    _props: PageProps & ProductSpotlightProps,
    carryForward: SpotlightCarryForward,
    _wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<ProductSpotlightFastViewState, SpotlightCarryForward>();
    const { product } = carryForward;

    return Pipeline.ok({
        product: {
            price: product.price,
            strikethroughPrice: product.strikethroughPrice,
            isAddingToCart: false,
            quickOption: {
                choices: (product.quickOption?.choices ?? []).map((c) => ({
                    choiceId: c.choiceId,
                    inStock: c.inStock,
                    isSelected: c.isSelected,
                })),
            },
            secondQuickOption: {
                choices: (product.secondQuickOption?.choices ?? []).map((c) => ({
                    choiceId: c.choiceId,
                    inStock: c.inStock,
                    isSelected: c.isSelected,
                })),
            },
        },
    }).toPhaseOutput((viewState) => {
        return { viewState, carryForward: { product } };
    });
}

function ProductSpotlightInteractive(
    _props: Props<PageProps & ProductSpotlightProps>,
    refs: ProductSpotlightRefs,
    viewStateSignals: Signals<ProductSpotlightFastViewState>,
    fastCarryForward: SpotlightCarryForward,
    storesContext: WixStoresContext,
) {
    const {
        product: [product, setProduct],
    } = viewStateSignals;

    const fullProduct = fastCarryForward.product;

    refs.product.addToCartButton.onclick(async () => {
        if (!fullProduct._id || fullProduct.quickAddType !== QuickAddType.SIMPLE) return;

        setProduct({ ...product(), isAddingToCart: true });
        try {
            await storesContext.addToCart(fullProduct._id, 1);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setProduct({ ...product(), isAddingToCart: false });
        }
    });

    refs.product.viewOptionsButton.onclick(() => {
        if (fullProduct.productUrl) {
            window.location.href = fullProduct.productUrl;
        }
    });

    return {
        render: (): ProductSpotlightInteractiveViewState => ({
            product: product(),
        }),
    };
}

export const productSpotlight = makeJayStackComponent<ProductSpotlightContract>()
    .withProps<PageProps & ProductSpotlightProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withContexts(WIX_STORES_CONTEXT)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSpotlightInteractive);

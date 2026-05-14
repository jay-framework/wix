import { patch, REPLACE } from '@jay-framework/json-patch';
import { ProductCardViewState, QuickAddType } from '../contracts/product-card.jay-contract';
import { getVariantStock } from '../actions/stores-actions';
import type { VariantStockMap } from './product-mapper';
import type { WixStoresContext } from '../contexts/wix-stores-context';

interface CardInteractionRefs {
    addToCartButton: { onclick: (handler: (ctx: { coordinate: string[] }) => void) => void };
    cardContainer: { onmouseenter: (handler: (ctx: { coordinate: string[] }) => void) => void };
    quickOption: {
        choices: {
            choiceButton: { onclick: (handler: (ctx: { coordinate: string[] }) => void) => void };
        };
    };
    secondQuickOption: {
        choices: {
            choiceButton: { onclick: (handler: (ctx: { coordinate: string[] }) => void) => void };
        };
    };
    viewOptionsButton: { onclick: (handler: (ctx: { coordinate: string[] }) => void) => void };
}

interface CardSignals {
    get(): ProductCardViewState[];
    set(value: ProductCardViewState[]): void;
}

export function setupCardInteractions(
    refs: CardInteractionRefs,
    cards: CardSignals,
    storesContext: WixStoresContext,
) {
    const variantStockCache: Record<string, VariantStockMap> = {};
    let variantStockApplied = new Set<string>();
    const variantStockLoading = new Set<string>();

    const loadVariantStock = async (productId: string) => {
        if (variantStockApplied.has(productId) || variantStockLoading.has(productId)) return;
        variantStockLoading.add(productId);

        try {
            const currentResults = cards.get();
            const productIndex = currentResults.findIndex((p) => p._id === productId);
            if (productIndex === -1) return;

            const product = currentResults[productIndex];
            if (product?.quickAddType !== QuickAddType.COLOR_AND_TEXT_OPTIONS) return;

            const stockMap =
                variantStockCache[productId] ?? (await getVariantStock({ productId }));
            variantStockCache[productId] = stockMap;
            variantStockApplied.add(productId);

            const selectedColor = product.quickOption?.choices?.find((c) => c.isSelected);
            const textChoices = product.secondQuickOption?.choices;
            if (!selectedColor || !textChoices) return;

            const colorStock = stockMap[selectedColor.choiceId];
            const updatedTextChoices = textChoices.map((c) => ({
                ...c,
                inStock: colorStock?.[c.choiceId] ?? false,
            }));
            cards.set(
                patch(cards.get(), [
                    {
                        op: REPLACE,
                        path: [productIndex, 'secondQuickOption', 'choices'],
                        value: updatedTextChoices,
                    },
                ]),
            );
        } finally {
            variantStockLoading.delete(productId);
        }
    };

    // Add to cart (SIMPLE products)
    refs.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;
        const currentResults = cards.get();
        const productIndex = currentResults.findIndex((p) => p._id === productId);
        if (productIndex === -1) return;

        cards.set(
            patch(currentResults, [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true },
            ]),
        );

        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            cards.set(
                patch(cards.get(), [
                    { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false },
                ]),
            );
        }
    });

    // Lazy-load variant stock on hover
    refs.cardContainer.onmouseenter(({ coordinate }) => {
        const [productId] = coordinate;
        loadVariantStock(productId);
    });

    // Quick option choice click
    refs.quickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;
        const currentResults = cards.get();
        const productIndex = currentResults.findIndex((p) => p._id === productId);
        if (productIndex === -1) return;

        const product = currentResults[productIndex];

        // COLOR_AND_TEXT_OPTIONS: color click toggles selection
        if (product.quickAddType === QuickAddType.COLOR_AND_TEXT_OPTIONS) {
            const choices = product.quickOption?.choices;
            if (!choices) return;
            const updatedChoices = choices.map((c) => ({
                ...c,
                isSelected: c.choiceId === choiceId,
            }));

            let updated = patch(currentResults, [
                {
                    op: REPLACE,
                    path: [productIndex, 'quickOption', 'choices'],
                    value: updatedChoices,
                },
            ]);

            const stockMap = variantStockCache[productId];
            if (stockMap) {
                const colorStock = stockMap[choiceId];
                const textChoices = product.secondQuickOption?.choices;
                if (textChoices) {
                    const updatedTextChoices = textChoices.map((c) => ({
                        ...c,
                        inStock: colorStock?.[c.choiceId] ?? false,
                    }));
                    updated = patch(updated, [
                        {
                            op: REPLACE,
                            path: [productIndex, 'secondQuickOption', 'choices'],
                            value: updatedTextChoices,
                        },
                    ]);
                }
            } else {
                loadVariantStock(productId);
            }

            cards.set(updated);
            return;
        }

        // SINGLE_OPTION: click = add to cart
        const choice = product.quickOption?.choices?.find((c) => c.choiceId === choiceId);
        if (!choice || !choice.inStock) return;

        cards.set(
            patch(currentResults, [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true },
            ]),
        );

        try {
            const optionId = product.quickOption._id;
            await storesContext.addToCart(productId, 1, {
                options: { [optionId]: choice.choiceId },
                modifiers: {},
                customTextFields: {},
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            cards.set(
                patch(cards.get(), [
                    { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false },
                ]),
            );
        }
    });

    // Second quick option choice click (COLOR_AND_TEXT_OPTIONS)
    refs.secondQuickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;
        const currentResults = cards.get();
        const productIndex = currentResults.findIndex((p) => p._id === productId);
        if (productIndex === -1) return;

        const product = currentResults[productIndex];
        const textChoice = product.secondQuickOption?.choices?.find(
            (c) => c.choiceId === choiceId,
        );
        const selectedColor = product.quickOption?.choices?.find((c) => c.isSelected);

        if (!textChoice || !textChoice.inStock) return;

        cards.set(
            patch(currentResults, [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true },
            ]),
        );

        try {
            const colorOptionId = product.quickOption?._id || '';
            const textOptionId = product.secondQuickOption?._id || '';
            await storesContext.addToCart(productId, 1, {
                options: {
                    [colorOptionId]: selectedColor?.choiceId || '',
                    [textOptionId]: textChoice.choiceId,
                },
                modifiers: {},
                customTextFields: {},
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            cards.set(
                patch(cards.get(), [
                    { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false },
                ]),
            );
        }
    });

    // View options button (NEEDS_CONFIGURATION)
    refs.viewOptionsButton.onclick(({ coordinate }) => {
        const [productId] = coordinate;
        const product = cards.get().find((p) => p._id === productId);
        if (product?.productUrl) {
            window.location.href = product.productUrl;
        }
    });

    return {
        resetCache() {
            variantStockApplied = new Set();
        },
    };
}

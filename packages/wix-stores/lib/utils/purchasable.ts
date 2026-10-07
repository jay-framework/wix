import { StockStatus } from '../contracts/product-page.jay-contract';

/** The stock fields of a product page variant */
export interface PurchasableVariant {
    inventoryStatus: StockStatus;
    /** Out-of-stock variants can still be bought when the store takes pre-orders for them */
    preorderEnabled: boolean;
}

/** The stock fields of a catalog variant, as the product page keeps them */
export function mapVariantStock(inventoryStatus: {
    inStock?: boolean;
    preorderEnabled?: boolean;
}): PurchasableVariant {
    return {
        inventoryStatus: inventoryStatus.inStock ? StockStatus.IN_STOCK : StockStatus.OUT_OF_STOCK,
        preorderEnabled: !!inventoryStatus.preorderEnabled,
    };
}

/** A variant can be added to the cart when it is in stock or open for pre-order */
export function isPurchasable(variant: PurchasableVariant): boolean {
    return (
        variant.inventoryStatus === StockStatus.IN_STOCK ||
        (variant.inventoryStatus === StockStatus.OUT_OF_STOCK && variant.preorderEnabled)
    );
}

/** The variant a product page starts on: the first in stock, else the first open for pre-order, else the first */
export function pickDefaultVariant<V extends PurchasableVariant>(variants: V[]): V {
    return (
        variants.find((v) => v.inventoryStatus === StockStatus.IN_STOCK) ||
        variants.find(isPurchasable) ||
        variants[0]
    );
}

/** Whether add to cart / buy now start enabled, for the product's stock status and its default variant */
export function initialActionsEnabled(
    productStockStatus: StockStatus,
    defaultVariant: PurchasableVariant,
): boolean {
    const isInStock = productStockStatus === StockStatus.IN_STOCK;
    return (isInStock || defaultVariant.preorderEnabled) && isPurchasable(defaultVariant);
}

/** Add to cart must request a pre-order for an out-of-stock catalog variant with pre-order enabled */
export function isPreOrderRequest(inventoryStatus?: {
    inStock?: boolean;
    preorderEnabled?: boolean;
}): boolean {
    return !inventoryStatus?.inStock && !!inventoryStatus?.preorderEnabled;
}

/**
 * devOnly source-editing actions (DL #38).
 *
 * Let the AIditor agent change product data at its source — the Wix Stores catalog — instead of
 * hard-coding it into jay-html. Exported from `tools.ts` only, so production never registers them.
 * Every write reads the current `revision` first and retries once on a revision conflict (409).
 */

import { makeJayAction, makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import { WixApiError } from '@jay-framework/wix-server-client';
import type { WixClient } from '@wix/sdk';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import {
    getProduct as getProductApi,
    getProductBySlug as getProductBySlugApi,
    updateProduct as updateProductApi,
} from '../wix-apis/index.js';
import type { ProductUpdate, V3Product } from '../wix-apis/types.js';
import { buildMainImageItems, isSupportedImageUrl } from './media-items.js';
import type {
    GetProductForEditingInput,
    GetProductForEditingOutput,
} from '../actions/get-product-for-editing.jay-action';
import type {
    UpdateProductMainImageInput,
    UpdateProductMainImageOutput,
} from '../actions/update-product-main-image.jay-action';
import type {
    UpdateProductTextInput,
    UpdateProductTextOutput,
} from '../actions/update-product-text.jay-action';

// ============================================================================
// Actions
// ============================================================================

export const getProductForEditing = makeJayQuery('wixStores.getProductForEditing')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(
        async (
            input: GetProductForEditingInput,
            wixStores: WixStoresService,
        ): Promise<GetProductForEditingOutput> => {
            const product = await readProduct(wixStores.wixClient, toProductIdentity(input));
            return toEditingSnapshot(product);
        },
    );

export const updateProductMainImage = makeJayAction('wixStores.updateProductMainImage')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(
        async (
            input: UpdateProductMainImageInput,
            wixStores: WixStoresService,
        ): Promise<UpdateProductMainImageOutput> => {
            const identity = toProductIdentity(input);
            assertSupportedImageUrl(input.imageUrl);
            const updated = await writeWithRevisionRetry(wixStores.wixClient, identity, {
                fields: ['MEDIA_ITEMS_INFO'],
                buildPatch: (current) => ({
                    media: {
                        itemsInfo: {
                            items: buildMainImageItems(
                                current.media?.itemsInfo?.items ?? [],
                                input.imageUrl,
                                { altText: input.altText, keepPrevious: input.keepPrevious },
                            ),
                        },
                    },
                }),
            });
            return {
                ...toWriteResult(updated),
                mainImageUrl: updated.media?.main?.url ?? '',
            };
        },
    );

export const updateProductText = makeJayAction('wixStores.updateProductText')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(
        async (
            input: UpdateProductTextInput,
            wixStores: WixStoresService,
        ): Promise<UpdateProductTextOutput> => {
            const identity = toProductIdentity(input);
            const textPatch = toTextPatch(input);
            const updated = await writeWithRevisionRetry(wixStores.wixClient, identity, {
                fields: ['PLAIN_DESCRIPTION'],
                buildPatch: () => textPatch,
            });
            return {
                ...toWriteResult(updated),
                name: updated.name ?? '',
                plainDescription: updated.plainDescription ?? '',
            };
        },
    );

// ============================================================================
// Product identity
// ============================================================================

type ProductIdentity = { productId: string } | { slug: string };

function toProductIdentity(input: { slug?: string; productId?: string }): ProductIdentity {
    if (input.productId) return { productId: input.productId };
    if (input.slug) return { slug: input.slug };
    throw new ActionError(
        'MISSING_PRODUCT_IDENTITY',
        'Pass slug (product-page route param / product-spotlight slug prop) or productId (product-card forEach itemId).',
    );
}

function describeIdentity(identity: ProductIdentity): string {
    return 'slug' in identity ? `slug "${identity.slug}"` : `productId "${identity.productId}"`;
}

// ============================================================================
// Read
// ============================================================================

const EDITING_READ_FIELDS = ['MEDIA_ITEMS_INFO', 'PLAIN_DESCRIPTION'];

async function readProduct(client: WixClient, identity: ProductIdentity): Promise<V3Product> {
    let product: V3Product | undefined;
    try {
        const options = { fields: EDITING_READ_FIELDS };
        ({ product } =
            'slug' in identity
                ? await getProductBySlugApi(client, identity.slug, options)
                : await getProductApi(client, identity.productId, options));
    } catch (error) {
        throw toReadActionError(error, identity);
    }
    if (!product?._id) throw productNotFound(identity);
    return product;
}

function toEditingSnapshot(product: V3Product): GetProductForEditingOutput {
    return {
        productId: product._id ?? '',
        slug: product.slug ?? '',
        revision: product.revision ?? '',
        name: product.name ?? '',
        plainDescription: product.plainDescription ?? '',
        media: {
            mainUrl: product.media?.main?.url ?? '',
            items: (product.media?.itemsInfo?.items ?? []).map((item) => ({
                id: item._id ?? '',
                url: item.url ?? '',
                mediaType: item.mediaType ?? '',
            })),
        },
    };
}

// ============================================================================
// Write
// ============================================================================

const MAX_WRITE_ATTEMPTS = 2;

type ProductPatch = Omit<ProductUpdate, 'id' | 'revision'>;

interface ProductWrite {
    /** Response fields to request from Wix. */
    fields: string[];
    /** Builds the patch from the product as just read (so arrays are rebuilt on retry). */
    buildPatch(current: V3Product): ProductPatch;
}

async function writeWithRevisionRetry(
    client: WixClient,
    identity: ProductIdentity,
    write: ProductWrite,
): Promise<V3Product> {
    for (let attempt = 1; ; attempt++) {
        const current = await readProduct(client, identity);
        try {
            const update = { id: current._id!, revision: current.revision ?? '' };
            const result = await updateProductApi(
                client,
                { ...update, ...write.buildPatch(current) },
                { fields: write.fields },
            );
            return result.product ?? current;
        } catch (error) {
            if (!isRevisionConflict(error) || attempt >= MAX_WRITE_ATTEMPTS) {
                throw toWriteActionError(error, identity);
            }
        }
    }
}

function toWriteResult(product: V3Product) {
    return {
        productId: product._id ?? '',
        slug: product.slug ?? '',
        revision: product.revision ?? '',
    };
}

function toTextPatch(input: UpdateProductTextInput): ProductPatch {
    if (input.name === undefined && input.plainDescription === undefined) {
        throw new ActionError(
            'NOTHING_TO_UPDATE',
            'Pass name and/or plainDescription (valid HTML) to update.',
        );
    }
    return {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.plainDescription !== undefined
            ? { plainDescription: input.plainDescription }
            : {}),
    };
}

function assertSupportedImageUrl(imageUrl: string): void {
    if (!isSupportedImageUrl(imageUrl)) {
        throw new ActionError(
            'INVALID_IMAGE_URL',
            `imageUrl "${imageUrl}" is not a public http(s) URL or a wix:image:// Media Manager URL. Ask the user for an image URL.`,
        );
    }
}

// ============================================================================
// Errors
// ============================================================================

function isRevisionConflict(error: unknown): boolean {
    return error instanceof WixApiError && error.status === 409;
}

function productNotFound(identity: ProductIdentity): ActionError {
    return new ActionError(
        'PRODUCT_NOT_FOUND',
        `No Wix Stores (Catalog V3) product with ${describeIdentity(identity)}.`,
    );
}

function toReadActionError(error: unknown, identity: ProductIdentity): ActionError {
    if (error instanceof WixApiError && error.status === 404) return productNotFound(identity);
    return toWixApiActionError(error, `read product with ${describeIdentity(identity)}`);
}

function toWriteActionError(error: unknown, identity: ProductIdentity): ActionError {
    if (error instanceof WixApiError && (error.status === 401 || error.status === 403)) {
        return new ActionError(
            'WRITE_NOT_AUTHORIZED',
            `Wix rejected the product update (${error.status}). Writes need apiKeyStrategy in config/.wix.yaml with an API key that has the Wix Stores "Manage Products" permission.`,
        );
    }
    if (isRevisionConflict(error)) {
        return new ActionError(
            'REVISION_CONFLICT',
            `The product with ${describeIdentity(identity)} kept changing while updating it; try again.`,
        );
    }
    return toWixApiActionError(error, `update product with ${describeIdentity(identity)}`);
}

function toWixApiActionError(error: unknown, operation: string): ActionError {
    if (error instanceof ActionError) return error;
    const detail =
        error instanceof WixApiError
            ? `${error.status} ${error.responseBody}`
            : (error as Error).message;
    return new ActionError('WIX_API_ERROR', `Failed to ${operation}: ${detail}`);
}

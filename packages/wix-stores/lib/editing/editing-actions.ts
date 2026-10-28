/**
 * devOnly source-editing actions (DL #38; image replacement from a local file / gallery item: DL #40).
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
import {
    buildReplacedImageItems,
    indexOfReplacedItem,
    isSupportedImageUrl,
} from './media-items.js';
import { readImageFile } from './image-file.js';
import { MediaUploadError, uploadImageToMediaFolder } from '../wix-apis/upload-media-file.js';
import type {
    GetProductForEditingInput,
    GetProductForEditingOutput,
} from '../actions/get-product-for-editing.jay-action';
import type {
    UpdateProductImageInput,
    UpdateProductImageOutput,
} from '../actions/update-product-image.jay-action';
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

export const updateProductImage = makeJayAction('wixStores.updateProductImage')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(
        async (
            input: UpdateProductImageInput,
            wixStores: WixStoresService,
        ): Promise<UpdateProductImageOutput> => {
            const client = wixStores.wixClient;
            const identity = toProductIdentity(input);
            const source = toImageSource(input);
            if (input.mediaId !== undefined)
                await assertMediaItemExists(client, identity, input.mediaId);
            const { imageUrl, uploadedFileId } = await resolveImageUrl(client, source);

            let replacedMediaId = '';
            let replacedIndex = 0;
            const updated = await writeWithRevisionRetry(client, identity, {
                fields: ['MEDIA_ITEMS_INFO'],
                buildPatch: (current) => {
                    const existingItems = current.media?.itemsInfo?.items ?? [];
                    replacedIndex = indexOfReplacedItem(existingItems, input.mediaId);
                    replacedMediaId = existingItems[replacedIndex]?._id ?? '';
                    const items = buildReplacedImageItems(existingItems, imageUrl, {
                        mediaId: input.mediaId,
                        altText: input.altText,
                        keepPrevious: input.keepPrevious,
                    });
                    return { media: { itemsInfo: { items } } };
                },
            });
            return {
                ...toWriteResult(updated),
                mainImageUrl: updated.media?.main?.url ?? '',
                imageUrl: updated.media?.itemsInfo?.items?.[replacedIndex]?.url ?? '',
                replacedMediaId,
                ...(uploadedFileId ? { uploadedFileId } : {}),
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

// ============================================================================
// Image source (DL #40)
// ============================================================================

type ImageSource = { imageUrl: string } | { imageFile: string };

function toImageSource(input: UpdateProductImageInput): ImageSource {
    const hasUrl = input.imageUrl !== undefined;
    const hasFile = input.imageFile !== undefined;
    if (hasUrl === hasFile) {
        throw new ActionError(
            'IMAGE_SOURCE_REQUIRED',
            'Pass exactly one of imageUrl (public http(s) or wix:image:// URL) or imageFile (local image path, e.g. an attachment).',
        );
    }
    if (hasUrl) {
        assertSupportedImageUrl(input.imageUrl!);
        return { imageUrl: input.imageUrl! };
    }
    return { imageFile: input.imageFile! };
}

async function assertMediaItemExists(
    client: WixClient,
    identity: ProductIdentity,
    mediaId: string,
): Promise<void> {
    const product = await readProduct(client, identity);
    indexOfReplacedItem(product.media?.itemsInfo?.items ?? [], mediaId);
}

async function resolveImageUrl(
    client: WixClient,
    source: ImageSource,
): Promise<{ imageUrl: string; uploadedFileId?: string }> {
    if ('imageUrl' in source) return { imageUrl: source.imageUrl };
    const upload = await readImageFile(source.imageFile);
    const uploadedFileId = await uploadImage(client, upload);
    return {
        imageUrl: `wix:image://v1/${uploadedFileId}/${encodeURIComponent(upload.fileName)}`,
        uploadedFileId,
    };
}

async function uploadImage(
    client: WixClient,
    upload: Parameters<typeof uploadImageToMediaFolder>[1],
): Promise<string> {
    try {
        return await uploadImageToMediaFolder(client, upload);
    } catch (error) {
        throw toUploadActionError(error);
    }
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

function toUploadActionError(error: unknown): ActionError {
    if (error instanceof WixApiError && (error.status === 401 || error.status === 403)) {
        return new ActionError(
            'MEDIA_UPLOAD_NOT_AUTHORIZED',
            `Wix rejected the Media Manager upload (${error.status}). The API key in config/.wix.yaml (apiKeyStrategy) needs the Media Manager permissions (manage folders, MEDIA.SITE_MEDIA_FILES_UPLOAD). Tell the user; don't work around it.`,
        );
    }
    if (error instanceof MediaUploadError) return new ActionError(error.code, error.message);
    return toWixApiActionError(error, 'upload the image to the Media Manager');
}

function toWixApiActionError(error: unknown, operation: string): ActionError {
    if (error instanceof ActionError) return error;
    const detail =
        error instanceof WixApiError
            ? `${error.status} ${error.responseBody}`
            : (error as Error).message;
    return new ActionError('WIX_API_ERROR', `Failed to ${operation}: ${detail}`);
}

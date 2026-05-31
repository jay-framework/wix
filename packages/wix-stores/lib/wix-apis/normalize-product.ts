/**
 * Normalize a REST API product response to the shape the product mapper expects.
 *
 * The REST API returns raw proto format while the SDK transforms field names:
 * - REST: product.id → normalized: product._id
 * - REST: media.main.image.url → normalized: media.main.url
 * - REST: media.main.id → normalized: media.main._id
 * - REST: options[].id → normalized: options[]._id
 * - REST: variants[].id → normalized: variants[]._id
 * - REST: infoSections[].id → normalized: infoSections[]._id
 */

import type { V3Product } from './types.js';

interface RawRecord {
    [key: string]: unknown;
}

function raw(value: unknown): RawRecord {
    return value as RawRecord;
}

function rawArray(value: unknown): RawRecord[] {
    return value as RawRecord[];
}

function str(value: unknown): string | undefined {
    return value as string | undefined;
}

export function normalizeProduct(product: RawRecord): V3Product {
    if (!product) return product as V3Product;

    const normalized: RawRecord = { ...product };

    // id → _id
    if (normalized.id && !normalized._id) {
        normalized._id = normalized.id;
    }

    // media.main normalization
    const media = raw(normalized.media);
    if (media?.main) {
        const main = raw(media.main);
        const mainImage = raw(main.image);
        normalized.media = {
            ...media,
            main: {
                _id: main.id || main._id,
                url: mainImage?.url || main.url,
                altText: mainImage?.altText || main.altText,
                mediaType: main.mediaType,
                width: mainImage?.width,
                height: mainImage?.height,
            },
        };
    }

    // media.itemsInfo.items normalization
    const updatedMedia = raw(normalized.media);
    const itemsInfo = raw(updatedMedia?.itemsInfo);
    if (itemsInfo?.items) {
        itemsInfo.items = rawArray(itemsInfo.items).map((item) => {
            const image = raw(item.image);
            return {
                _id: item.id || item._id,
                url: image?.url || item.url,
                altText: image?.altText || item.altText,
                mediaType: item.mediaType,
                width: image?.width,
                height: image?.height,
            };
        });
    }

    // options normalization
    if (normalized.options) {
        normalized.options = rawArray(normalized.options).map((opt) => {
            const choicesSettings = raw(opt.choicesSettings);
            return {
                ...opt,
                _id: opt.id || opt._id,
                choices: choicesSettings?.choices
                    ? rawArray(choicesSettings.choices).map((c) => {
                          const linkedMedia = c.linkedMedia as RawRecord[] | undefined;
                          const firstMedia = linkedMedia?.[0];
                          const firstMediaImage = firstMedia ? raw(firstMedia.image) : undefined;
                          return {
                              ...c,
                              _id: c.choiceId || c._id,
                              value: c.name || c.value,
                              media: firstMedia
                                  ? {
                                        _id: firstMedia.id,
                                        url: str(firstMediaImage?.url) || firstMedia.url,
                                        mediaType: firstMedia.mediaType,
                                    }
                                  : undefined,
                          };
                      })
                    : undefined,
            };
        });
    }

    // modifiers normalization
    if (normalized.modifiers) {
        normalized.modifiers = rawArray(normalized.modifiers).map((mod) => {
            const choicesSettings = raw(mod.choicesSettings);
            return {
                ...mod,
                _id: mod.id || mod._id,
                choices: choicesSettings?.choices
                    ? rawArray(choicesSettings.choices).map((c) => ({
                          ...c,
                          _id: c.choiceId || c._id,
                          value: c.name || c.value,
                      }))
                    : undefined,
            };
        });
    }

    // infoSections normalization
    if (normalized.infoSections) {
        normalized.infoSections = rawArray(normalized.infoSections).map((s) => ({
            ...s,
            _id: s.id || s._id,
        }));
    }

    // variantsInfo normalization
    const variantsInfo = raw(normalized.variantsInfo);
    if (variantsInfo?.variants) {
        variantsInfo.variants = rawArray(variantsInfo.variants).map((v) => ({
            ...v,
            _id: v.id || v._id,
        }));
    }

    // ribbon normalization
    if (normalized.ribbon) {
        const ribbon = raw(normalized.ribbon);
        normalized.ribbon = {
            ...ribbon,
            _id: ribbon.id || ribbon._id,
        };
    }

    return normalized as V3Product;
}

/**
 * Normalize an array of products.
 */
export function normalizeProducts(products: RawRecord[]): V3Product[] {
    return products.map(normalizeProduct);
}

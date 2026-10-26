// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReplacedImageItems, isSupportedImageUrl } from '../../lib/editing/media-items.js';
import type { ProductMediaItem } from '../../lib/wix-apis/types.js';

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'edit-main-image');

async function readFixture<T>(name: string): Promise<T> {
    return JSON.parse(await readFile(path.join(fixturesDir, name), 'utf-8')) as T;
}

const NEW_IMAGE_URL = 'https://example.com/red-sneaker.jpg';

describe('buildReplacedImageItems', () => {
    it('replaces the main item with the new url and re-sends the rest by id', async () => {
        const existingItems = await readFixture<ProductMediaItem[]>('existing-items.json');

        const items = buildReplacedImageItems(existingItems, NEW_IMAGE_URL, {
            altText: 'Red sneaker',
        });

        expect(items).toEqual(await readFixture('expected-replace.json'));
    });

    it('prepends the new url and keeps the previous main when keepPrevious is set', async () => {
        const existingItems = await readFixture<ProductMediaItem[]>('existing-items.json');

        const items = buildReplacedImageItems(existingItems, NEW_IMAGE_URL, { keepPrevious: true });

        expect(items).toEqual(await readFixture('expected-keep-previous.json'));
    });

    it('sets a wix:image:// Media Manager url by its media id', async () => {
        const existingItems = await readFixture<ProductMediaItem[]>('existing-items.json');

        const items = buildReplacedImageItems(
            existingItems,
            'wix:image://v1/c837a6_red~mv2.jpg/red-sneaker.jpg#originWidth=800&originHeight=800',
        );

        expect(items).toEqual(await readFixture('expected-wix-image.json'));
    });

    it('replaces the gallery item with the given mediaId in place, keeping the main', async () => {
        const existingItems = await readFixture<ProductMediaItem[]>('existing-items.json');

        const items = buildReplacedImageItems(existingItems, NEW_IMAGE_URL, {
            mediaId: 'c837a6_back~mv2.jpg',
        });

        expect(items).toEqual(await readFixture('expected-replace-middle.json'));
    });

    it('replaces the last gallery item in place', async () => {
        const existingItems = await readFixture<ProductMediaItem[]>('existing-items.json');

        const items = buildReplacedImageItems(existingItems, NEW_IMAGE_URL, {
            mediaId: '11062b_video',
            altText: 'Teaser',
        });

        expect(items).toEqual(await readFixture('expected-replace-last.json'));
    });

    it('inserts before the given item and keeps it when keepPrevious is set', async () => {
        const existingItems = await readFixture<ProductMediaItem[]>('existing-items.json');

        const items = buildReplacedImageItems(existingItems, NEW_IMAGE_URL, {
            mediaId: 'c837a6_back~mv2.jpg',
            keepPrevious: true,
        });

        expect(items).toEqual(await readFixture('expected-keep-previous-middle.json'));
    });

    it('fails with MEDIA_ITEM_NOT_FOUND for an unknown mediaId', async () => {
        const existingItems = await readFixture<ProductMediaItem[]>('existing-items.json');

        expect(() =>
            buildReplacedImageItems(existingItems, NEW_IMAGE_URL, { mediaId: 'nope' }),
        ).toThrow(expect.objectContaining({ code: 'MEDIA_ITEM_NOT_FOUND' }));
    });

    it('creates a single main item for a product without media', async () => {
        const items = buildReplacedImageItems([], NEW_IMAGE_URL);

        expect(items).toEqual(await readFixture('expected-no-media.json'));
    });
});

describe('isSupportedImageUrl', () => {
    it.each([
        ['https://example.com/a.jpg', true],
        ['http://example.com/a.jpg', true],
        ['wix:image://v1/c837a6_red~mv2.jpg/red.jpg', true],
        ['wix:video://v1/11062b_video/clip.mp4', false],
        ['/images/local.jpg', false],
        ['red sneaker', false],
        ['', false],
    ])('%s → %s', (url, expected) => {
        expect(isSupportedImageUrl(url)).toEqual(expected);
    });
});

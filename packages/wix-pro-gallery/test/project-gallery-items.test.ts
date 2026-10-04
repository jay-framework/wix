import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectGalleryItems } from '../lib/utils/project-gallery-items.js';
import type { GetGalleryResponse } from '../lib/wix-apis/get-gallery.js';

const fixtures = path.join(__dirname, 'fixtures/get-gallery');
const readJson = async <T>(name: string): Promise<T> =>
    JSON.parse(await readFile(path.join(fixtures, name), 'utf-8'));

describe('projectGalleryItems', () => {
    it.each(['classic-slideshow', 'mixed-items'])('projects the %s API response', async (name) => {
        const response = await readJson<GetGalleryResponse>(`${name}.response.json`);
        const expected = await readJson<unknown>(`${name}.expected.json`);
        expect(projectGalleryItems(response.gallery?.items ?? [])).toEqual(expected);
    });

    it('returns no items for an empty gallery', () => {
        expect(projectGalleryItems([])).toEqual([]);
    });
});

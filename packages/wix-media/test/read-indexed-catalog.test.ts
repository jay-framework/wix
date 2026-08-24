// @vitest-environment node

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { browseIndexedMediaCatalog } from '../lib/catalog/read-indexed-catalog.js';

describe('browseIndexedMediaCatalog', () => {
    it('groups indexed items by folderPath for browse navigation', () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 'wix-media-catalog-'));
        const addMenuDir = join(projectRoot, 'agent-kit/aiditor/add-menu');
        mkdirSync(addMenuDir, { recursive: true });
        writeFileSync(
            join(addMenuDir, 'wix-media.generated.yaml'),
            `items:
  - id: wix-media:hero
    title: Hero
    category: Media
    folderPath: [Marketing]
    prompt: |
      URL: https://static.wixstatic.com/media/hero.jpg
      Type: image
  - id: wix-media:logo
    title: Logo
    category: Media
    prompt: |
      URL: https://static.wixstatic.com/media/logo.jpg
      Type: image
  - id: wix-media:campaign-shot
    title: Campaign Shot
    category: Media
    folderPath: [Marketing, Campaigns]
    prompt: |
      URL: https://static.wixstatic.com/media/campaign.jpg
      Type: image
`,
            'utf-8',
        );

        const rootBrowse = browseIndexedMediaCatalog(projectRoot, []);
        expect(rootBrowse.totalItems).toBe(3);
        expect(rootBrowse.folders.map((folder) => folder.name)).toEqual(['Marketing']);
        expect(rootBrowse.files.map((file) => file.title)).toEqual(['Logo']);

        const marketingBrowse = browseIndexedMediaCatalog(projectRoot, ['Marketing']);
        expect(marketingBrowse.folders.map((folder) => folder.name)).toEqual(['Campaigns']);
        expect(marketingBrowse.files.map((file) => file.title)).toEqual(['Hero']);
    });
});

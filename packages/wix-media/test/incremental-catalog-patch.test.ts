// @vitest-environment node

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readMediaCatalogDocument } from '../lib/catalog/catalog-document.js';
import {
    appendMediaFileToCatalog,
    registerEmptyFolderInCatalog,
} from '../lib/catalog/incremental-catalog-patch.js';
import { browseIndexedMediaCatalog } from '../lib/catalog/read-indexed-catalog.js';
import type { MediaFileInfo } from '../lib/services/wix-media-service.js';

function writeSeedCatalog(projectRoot: string): void {
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
`,
        'utf-8',
    );
}

describe('incremental catalog patch', () => {
    it('registers an empty folder without rebuilding the full catalog', () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 'wix-media-patch-'));
        writeSeedCatalog(projectRoot);

        const patch = registerEmptyFolderInCatalog(projectRoot, ['Marketing', 'New Campaign']);

        expect(patch.itemCount).toBe(1);
        expect(patch.emptyFolderCount).toBe(1);

        const document = readMediaCatalogDocument(projectRoot);
        expect(document.emptyFolders).toEqual([['Marketing', 'New Campaign']]);

        const marketingBrowse = browseIndexedMediaCatalog(projectRoot, ['Marketing']);
        expect(marketingBrowse.folders.map((folder) => folder.name)).toEqual(['New Campaign']);
        expect(marketingBrowse.folders[0]?.childCountLabel).toBe('empty');
    });

    it('appends a single uploaded file and removes the empty-folder marker', () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 'wix-media-patch-'));
        writeSeedCatalog(projectRoot);
        registerEmptyFolderInCatalog(projectRoot, ['Marketing', 'New Campaign']);

        const uploadedFile: MediaFileInfo = {
            id: 'uploaded-file-id',
            displayName: 'Launch Banner',
            slug: 'launch-banner',
            url: 'https://static.wixstatic.com/media/launch.jpg',
            mediaType: 'image',
            labels: [],
            folderId: 'folder-id',
            folderName: 'New Campaign',
            folderPath: ['Marketing', 'New Campaign'],
        };

        const patch = appendMediaFileToCatalog(projectRoot, uploadedFile);

        expect(patch.itemCount).toBe(2);
        expect(patch.emptyFolderCount).toBe(0);

        const catalogYaml = readFileSync(
            join(projectRoot, 'agent-kit/aiditor/add-menu/wix-media.generated.yaml'),
            'utf-8',
        );
        expect(catalogYaml).toEqual(expect.stringContaining('Launch Banner'));

        const campaignBrowse = browseIndexedMediaCatalog(projectRoot, [
            'Marketing',
            'New Campaign',
        ]);
        expect(campaignBrowse.files.map((file) => file.title)).toEqual(['Launch Banner']);
    });
});

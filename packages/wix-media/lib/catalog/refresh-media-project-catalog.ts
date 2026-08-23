import * as fs from 'node:fs';
import * as path from 'node:path';

import type { WixMediaService } from '../services/wix-media-service.js';
import { generateMediaIndex } from '../index-generator.js';
import { buildMediaAddMenuItems } from '../add-menu/media-items.js';
import { writeMediaCatalogDocument } from './catalog-document.js';

export type RefreshMediaProjectCatalogResult = {
    itemCount: number;
    outputRel: string;
    indexRel: string;
};

export async function refreshMediaProjectCatalog(
    projectRoot: string,
    mediaService: WixMediaService,
): Promise<RefreshMediaProjectCatalogResult> {
    const files = await mediaService.listPublicFiles();
    const referencesDir = path.join(projectRoot, 'agent-kit', 'references', 'wix-media');
    fs.mkdirSync(referencesDir, { recursive: true });

    const indexRel = 'agent-kit/references/wix-media/MEDIA-INDEX.md';
    const indexPath = path.join(projectRoot, indexRel);
    fs.writeFileSync(indexPath, generateMediaIndex(files), 'utf-8');

    const outputRel = writeMediaCatalogDocument(projectRoot, {
        items: buildMediaAddMenuItems(files),
        emptyFolders: [],
    });

    return { itemCount: files.length, outputRel, indexRel };
}

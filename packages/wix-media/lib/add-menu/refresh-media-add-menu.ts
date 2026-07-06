import type { WixMediaService } from '../services/wix-media-service.js';
import { buildMediaAddMenuItems } from './media-items.js';
import { writeGeneratedAddMenuCatalog } from './write-add-menu-catalog.js';

export async function refreshMediaAddMenuCatalog(
    projectRoot: string,
    mediaService: WixMediaService,
): Promise<{ itemCount: number; outputRel: string }> {
    const files = await mediaService.listPublicFiles();
    const items = buildMediaAddMenuItems(files);
    const outputRel = writeGeneratedAddMenuCatalog(projectRoot, items);
    return { itemCount: items.length, outputRel };
}

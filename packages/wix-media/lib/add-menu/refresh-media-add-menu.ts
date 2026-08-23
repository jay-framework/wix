import type { WixMediaService } from '../services/wix-media-service.js';
import { refreshMediaProjectCatalog } from '../catalog/refresh-media-project-catalog.js';

export async function refreshMediaAddMenuCatalog(
    projectRoot: string,
    mediaService: WixMediaService,
): Promise<{ itemCount: number; outputRel: string }> {
    const result = await refreshMediaProjectCatalog(projectRoot, mediaService);
    return { itemCount: result.itemCount, outputRel: result.outputRel };
}

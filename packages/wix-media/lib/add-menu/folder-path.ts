/** Design Log #34 — Wix Media Manager folder paths for Add Menu navigation. */

export const WIX_MEDIA_SITE_FILES_LABEL = 'Site Files';

export type WixMediaFolderRecord = {
    name: string;
    parentFolderId?: string | null;
};

export function buildMediaFolderPath(
    folderId: string,
    folderIndex: Map<string, WixMediaFolderRecord>,
): string[] {
    if (!folderId || folderId === 'media-root') return [];

    const segments: string[] = [];
    let currentFolderId: string | undefined = folderId;
    const visitedFolderIds = new Set<string>();

    while (
        currentFolderId &&
        currentFolderId !== 'media-root' &&
        !visitedFolderIds.has(currentFolderId)
    ) {
        visitedFolderIds.add(currentFolderId);
        const folder = folderIndex.get(currentFolderId);
        if (!folder) break;
        segments.unshift(folder.name);
        const parentFolderId = folder.parentFolderId ?? undefined;
        if (!parentFolderId || parentFolderId === 'media-root') break;
        currentFolderId = parentFolderId;
    }

    if (segments.length === 0) return [];
    return [WIX_MEDIA_SITE_FILES_LABEL, ...segments];
}

export const WIX_MEDIA_SITE_FILES_LABEL = 'Site Files';

export type WixMediaFolderRecord = {
    name: string;
    parentFolderId?: string | null;
};

/** Strip the Wix "Site Files" container — browse starts at its children. */
function stripSiteFilesContainer(segments: string[]): string[] {
    const path = [...segments];
    while (path[0] === WIX_MEDIA_SITE_FILES_LABEL) {
        path.shift();
    }
    return path;
}

/**
 * Folder paths for Add Menu browse — relative to inside Site Files (no container segment).
 * MEDIA_ROOT and direct children of a "Site Files" folder map to `[]`.
 */
export function buildMediaFolderPath(
    folderId: string,
    folderIndex: Map<string, WixMediaFolderRecord>,
): string[] {
    if (!folderId || folderId === 'media-root') {
        return [];
    }

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

    return stripSiteFilesContainer(segments);
}

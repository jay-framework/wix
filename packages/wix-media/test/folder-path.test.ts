import { describe, expect, it } from 'vitest';

import {
    buildMediaFolderPath,
    WIX_MEDIA_SITE_FILES_LABEL,
    type WixMediaFolderRecord,
} from '../lib/add-menu/folder-path.js';

function folderIndex(
    entries: Record<string, WixMediaFolderRecord>,
): Map<string, WixMediaFolderRecord> {
    return new Map(Object.entries(entries));
}

describe('buildMediaFolderPath', () => {
    it('returns empty path for media root files', () => {
        expect(
            buildMediaFolderPath('media-root', folderIndex({})),
        ).toEqual([]);
    });

    it('builds Site Files prefix for nested folders', () => {
        const index = folderIndex({
            'folder-1': { name: 'Marketing', parentFolderId: 'media-root' },
            'folder-2': { name: 'Campaigns', parentFolderId: 'folder-1' },
        });

        expect(buildMediaFolderPath('folder-1', index)).toEqual([
            WIX_MEDIA_SITE_FILES_LABEL,
            'Marketing',
        ]);
        expect(buildMediaFolderPath('folder-2', index)).toEqual([
            WIX_MEDIA_SITE_FILES_LABEL,
            'Marketing',
            'Campaigns',
        ]);
    });
});

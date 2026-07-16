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
    it('maps media root files to browse root (inside Site Files)', () => {
        expect(buildMediaFolderPath('media-root', folderIndex({}))).toEqual([]);
    });

    it('strips Site Files container folder from paths', () => {
        const index = folderIndex({
            'site-files': { name: 'Site Files', parentFolderId: 'media-root' },
            'folder-1': { name: 'Marketing', parentFolderId: 'site-files' },
        });

        expect(buildMediaFolderPath('site-files', index)).toEqual([]);
        expect(buildMediaFolderPath('folder-1', index)).toEqual(['Marketing']);
    });

    it('builds paths from first-level folders under media root', () => {
        const index = folderIndex({
            'folder-1': { name: 'Marketing', parentFolderId: 'media-root' },
            'folder-2': { name: 'Campaigns', parentFolderId: 'folder-1' },
        });

        expect(buildMediaFolderPath('folder-1', index)).toEqual(['Marketing']);
        expect(buildMediaFolderPath('folder-2', index)).toEqual(['Marketing', 'Campaigns']);
    });
});

// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { managerThumbnailUrlForAddMenu } from '../lib/add-menu/manager-thumbnail-url.js';
import type { MediaFileInfo } from '../lib/services/wix-media-service.js';

function file(overrides: Partial<MediaFileInfo> & Pick<MediaFileInfo, 'displayName' | 'url' | 'mediaType'>): MediaFileInfo {
    return {
        id: 'file-id',
        slug: 'file',
        labels: [],
        folderId: 'media-root',
        folderName: 'Media Root',
        folderPath: [],
        ...overrides,
    };
}

describe('managerThumbnailUrlForAddMenu', () => {
    it('uses Wix Media Manager thumbnailUrl for video poster frames', () => {
        const poster = 'https://static.wixstatic.com/media/poster_abc~mv2.jpg';
        expect(
            managerThumbnailUrlForAddMenu(
                file({
                    displayName: 'clip.mp4',
                    url: 'https://video.wixstatic.com/video/abc/file',
                    mediaType: 'video',
                    thumbnailUrl: poster,
                }),
            ),
        ).toBe(poster);
    });

    it('uses thumbnailUrl for documents when the API provides a preview', () => {
        const preview = 'https://static.wixstatic.com/media/doc-preview~mv2.jpg';
        expect(
            managerThumbnailUrlForAddMenu(
                file({
                    displayName: 'brochure.pdf',
                    url: 'https://static.wixstatic.com/ugd/doc-id',
                    mediaType: 'document',
                    thumbnailUrl: preview,
                }),
            ),
        ).toBe(preview);
    });

    it('falls back to asset url for images and vectors without thumbnailUrl', () => {
        const imageUrl = 'https://static.wixstatic.com/media/hero~mv2.jpg';
        expect(
            managerThumbnailUrlForAddMenu(
                file({ displayName: 'hero.jpg', url: imageUrl, mediaType: 'image' }),
            ),
        ).toBe(imageUrl);
    });

    it('returns undefined for archives without manager thumbnail or visual url', () => {
        expect(
            managerThumbnailUrlForAddMenu(
                file({
                    displayName: 'bundle.zip',
                    url: 'https://static.wixstatic.com/media/bundle.zip',
                    mediaType: 'archive',
                }),
            ),
        ).toBeUndefined();
    });
});

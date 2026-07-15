// @vitest-environment node

import { readFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { buildMediaAddMenuItems, thumbnailUrlForMedia } from '../lib/add-menu/media-items.js';
import type { MediaFileInfo } from '../lib/services/wix-media-service.js';
import { writeGeneratedAddMenuCatalog } from '../lib/add-menu/write-add-menu-catalog.js';

const REJECTED_ITEM_FIELDS = ['kind', 'parameters', 'component', 'allowedScopes'] as const;
const REQUIRED_ITEM_FIELDS = ['id', 'title', 'category', 'prompt'] as const;

function loadFixtureFiles(): MediaFileInfo[] {
    const fixturePath = join(import.meta.dirname, 'fixtures/add-menu/media-files.yaml');
    const parsed = loadYaml(readFileSync(fixturePath, 'utf-8')) as { files: MediaFileInfo[] };
    return parsed.files;
}

describe('buildMediaAddMenuItems', () => {
    it('creates one Add Menu item per media file with complete prompts', () => {
        const items = buildMediaAddMenuItems(loadFixtureFiles());

        expect(items).toHaveLength(3);
        expect(items.map((item) => item.id)).toEqual([
            'wix-media:hero-banner',
            'wix-media:promo-clip',
            'wix-media:logo',
        ]);

        for (const item of items) {
            for (const field of REQUIRED_ITEM_FIELDS) {
                expect(typeof item[field]).toBe('string');
                expect((item[field] as string).trim().length).toBeGreaterThan(0);
            }
            for (const field of REJECTED_ITEM_FIELDS) {
                expect(item).not.toHaveProperty(field);
            }
            expect(item.category).toBe('Media');
            expect(item.pluginName).toBe('wix-media');
            expect(item.packageName).toBe('@jay-framework/wix-media');
            expect(item.prompt).toMatch(/agent-kit\/designer\/wix-media\.md/);
            expect(item.prompt).toMatch(/^URL: /m);
        }
    });

    it('uses folderPath in Add Menu items and subCategory by media type', () => {
        const items = buildMediaAddMenuItems(loadFixtureFiles());
        const hero = items.find((item) => item.id === 'wix-media:hero-banner');
        const video = items.find((item) => item.id === 'wix-media:promo-clip');
        const logo = items.find((item) => item.id === 'wix-media:logo');

        expect(hero?.title).toBe('Hero Banner');
        expect(hero?.subCategory).toBe('Images');
        expect(hero?.folderPath).toEqual(['Site Files', 'Marketing']);
        expect(video?.subCategory).toBe('Videos');
        expect(video?.folderPath).toEqual(['Site Files', 'Marketing']);
        expect(logo?.folderPath).toBeUndefined();
    });

    it('sets image thumbnail to the Wix CDN URL', () => {
        const files = loadFixtureFiles();
        const hero = files[0]!;
        expect(thumbnailUrlForMedia(hero)).toBe(hero.url);
        expect(buildMediaAddMenuItems(files)[0]?.thumbnail).toBe(hero.url);
    });

    it('sets stage-place interaction on visual media for drag-to-stage', () => {
        const files = loadFixtureFiles();
        const items = buildMediaAddMenuItems(files);
        const heroFile = files[0]!;
        const hero = items.find((item) => item.id === 'wix-media:hero-banner');
        const logo = items.find((item) => item.id === 'wix-media:logo');
        const video = items.find((item) => item.id === 'wix-media:promo-clip');

        expect(hero?.interaction).toEqual({
            mode: 'stage-place',
            persistOnPage: true,
            stagePromptTemplate: expect.stringMatching(/^Place this image at the marker location/),
        });
        expect(hero?.interaction?.stagePromptTemplate).toContain(heroFile.url);
        expect(logo?.interaction?.mode).toBe('stage-place');
        expect(video?.interaction).toEqual({
            mode: 'stage-place',
            persistOnPage: true,
            stagePromptTemplate: expect.stringMatching(/^Place this video at the marker location/),
        });
    });

    it('sets thumbnail for SVG and vector assets classified as other', () => {
        const svgUrl = 'https://static.wixstatic.com/media/asset-1.svg';
        const svgFile = {
            id: 'svg-1',
            displayName: 'Asset 1.svg',
            slug: 'asset-1',
            url: svgUrl,
            mediaType: 'other',
            labels: [],
            folderId: 'folder-1',
            folderName: 'Icons',
            folderPath: ['Site Files', 'Icons'],
        };
        expect(thumbnailUrlForMedia(svgFile)).toBe(svgUrl);
        expect(buildMediaAddMenuItems([svgFile])[0]?.thumbnail).toBe(svgUrl);
    });

    it('does not set thumbnail for non-visual files like zip archives', () => {
        const zipFile = {
            id: 'zip-1',
            displayName: 'Golf Group Website.zip',
            slug: 'golf-group-website',
            url: 'https://static.wixstatic.com/media/archive.zip',
            mediaType: 'other',
            labels: [],
            folderId: 'folder-1',
            folderName: 'Downloads',
            folderPath: ['Site Files', 'Downloads'],
        };
        expect(thumbnailUrlForMedia(zipFile)).toBeUndefined();
        expect(buildMediaAddMenuItems([zipFile])[0]?.thumbnail).toBeUndefined();
    });
});

describe('writeGeneratedAddMenuCatalog', () => {
    it('writes wix-media.generated.yaml under agent-kit/aiditor/add-menu', () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 'wix-media-add-menu-'));
        try {
            const items = buildMediaAddMenuItems(loadFixtureFiles());
            const rel = writeGeneratedAddMenuCatalog(projectRoot, items);
            expect(rel).toBe('agent-kit/aiditor/add-menu/wix-media.generated.yaml');

            const outputPath = join(projectRoot, rel);
            expect(existsSync(outputPath)).toBe(true);
            const written = readFileSync(outputPath, 'utf-8');
            expect(written).toMatch(/DO NOT EDIT BY HAND/);
            expect(written).toMatch(/wix-media:hero-banner/);
            expect(written).toMatch(/https:\/\/static\.wixstatic\.com\/media\/abc123/);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });
});

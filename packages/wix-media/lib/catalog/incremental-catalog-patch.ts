import * as fs from 'node:fs';
import * as path from 'node:path';

import { buildMediaAddMenuItems } from '../add-menu/media-items.js';
import { generateMediaIndex } from '../index-generator.js';
import type { MediaFileInfo } from '../services/wix-media-service.js';
import {
    catalogItemIdForFile,
    folderPathKey,
    normalizeFolderPath,
    readMediaCatalogDocument,
    writeMediaCatalogDocument,
    type MediaCatalogDocument,
} from './catalog-document.js';

export type IncrementalCatalogPatchResult = {
    itemCount: number;
    outputRel: string;
    indexRel: string;
    emptyFolderCount: number;
};

const MEDIA_INDEX_REL = 'agent-kit/references/wix-media/MEDIA-INDEX.md';

function isPrefixPath(prefix: string[], full: string[]): boolean {
    if (prefix.length > full.length) return false;
    return prefix.every((segment, index) => full[index] === segment);
}

function catalogItemToMediaFileInfo(item: {
    id: string;
    title: string;
    folderPath?: string[];
    prompt?: string;
}): MediaFileInfo {
    const mediaId = item.id.startsWith('wix-media:') ? item.id.slice('wix-media:'.length) : item.id;
    const urlMatch = item.prompt?.match(/URL:\s*(https?:\/\/\S+)/);
    const typeMatch = item.prompt?.match(/Type:\s*([^\s·]+)/);
    const slugMatch = item.prompt?.match(/Slug:\s*(\S+)/);
    const folderPath = normalizeFolderPath(item.folderPath);

    return {
        id: mediaId,
        displayName: item.title,
        slug: slugMatch?.[1] ?? mediaId.slice(0, 8),
        url: urlMatch?.[1] ?? '',
        mediaType: typeMatch?.[1]?.toLowerCase() ?? 'unknown',
        labels: [],
        folderId: '',
        folderName: folderPath[folderPath.length - 1] ?? 'Media Root',
        folderPath,
    };
}

function rewriteMediaIndexFromCatalog(document: MediaCatalogDocument, projectRoot: string): void {
    const files = document.items.map((item) => catalogItemToMediaFileInfo(item));
    const indexPath = path.join(projectRoot, MEDIA_INDEX_REL);
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, generateMediaIndex(files), 'utf-8');
}

function writePatchedCatalog(
    projectRoot: string,
    document: MediaCatalogDocument,
): IncrementalCatalogPatchResult {
    const outputRel = writeMediaCatalogDocument(projectRoot, document);
    rewriteMediaIndexFromCatalog(document, projectRoot);

    return {
        itemCount: document.items.length,
        emptyFolderCount: document.emptyFolders.length,
        outputRel,
        indexRel: MEDIA_INDEX_REL,
    };
}

function removeEmptyFolderPaths(document: MediaCatalogDocument, folderPath: string[]): void {
    const targetKey = folderPathKey(folderPath);
    document.emptyFolders = document.emptyFolders.filter(
        (candidate) => folderPathKey(candidate) !== targetKey,
    );
}

function removeRedundantEmptyFolders(document: MediaCatalogDocument): void {
    const filePaths = document.items.map((item) => normalizeFolderPath(item.folderPath));
    document.emptyFolders = document.emptyFolders.filter((emptyFolderPath) => {
        const hasFileInFolder = filePaths.some(
            (filePath) => folderPathKey(filePath) === folderPathKey(emptyFolderPath),
        );
        return !hasFileInFolder;
    });
}

export function registerEmptyFolderInCatalog(
    projectRoot: string,
    folderPath: string[],
): IncrementalCatalogPatchResult {
    const normalizedPath = normalizeFolderPath(folderPath);
    if (normalizedPath.length === 0) {
        throw new Error('Cannot register the media root as an empty folder.');
    }

    const document = readMediaCatalogDocument(projectRoot);
    const alreadyListed = document.emptyFolders.some(
        (candidate) => folderPathKey(candidate) === folderPathKey(normalizedPath),
    );
    const hasIndexedFiles = document.items.some(
        (item) =>
            folderPathKey(normalizeFolderPath(item.folderPath)) === folderPathKey(normalizedPath),
    );

    if (!alreadyListed && !hasIndexedFiles) {
        document.emptyFolders.push(normalizedPath);
    }

    removeRedundantEmptyFolders(document);
    return writePatchedCatalog(projectRoot, document);
}

export function appendMediaFileToCatalog(
    projectRoot: string,
    file: MediaFileInfo,
): IncrementalCatalogPatchResult {
    const document = readMediaCatalogDocument(projectRoot);
    const [newItem] = buildMediaAddMenuItems([file]);
    if (!newItem) {
        throw new Error('Failed to build add-menu item for uploaded file.');
    }

    const nextId = catalogItemIdForFile(file.id);
    document.items = document.items.filter((item) => item.id !== nextId);
    document.items.push(newItem);

    removeEmptyFolderPaths(document, normalizeFolderPath(file.folderPath));
    removeRedundantEmptyFolders(document);

    return writePatchedCatalog(projectRoot, document);
}

export function emptyFolderPathsForBrowse(
    document: MediaCatalogDocument,
    currentFolderPath: string[],
): string[][] {
    const normalizedCurrent = normalizeFolderPath(currentFolderPath);
    return document.emptyFolders.filter((emptyFolderPath) => {
        if (emptyFolderPath.length !== normalizedCurrent.length + 1) return false;
        return isPrefixPath(normalizedCurrent, emptyFolderPath);
    });
}

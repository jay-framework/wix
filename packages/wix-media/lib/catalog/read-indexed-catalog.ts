import * as fs from 'node:fs';
import * as path from 'node:path';

import { load as loadYaml } from 'js-yaml';

import { ADD_MENU_GENERATED_REL } from '../add-menu/write-add-menu-catalog.js';
import { readMediaCatalogDocument } from './catalog-document.js';
import { emptyFolderPathsForBrowse } from './incremental-catalog-patch.js';

export type IndexedMediaFileRow = {
    id: string;
    title: string;
    folderPath: string[];
    thumbnail?: string;
    mediaType?: string;
    url?: string;
};

export type IndexedMediaBrowseFolderRow = {
    rowKey: string;
    name: string;
    childCountLabel: string;
    folderPathJson: string;
};

export type IndexedMediaBrowseFileRow = {
    rowKey: string;
    title: string;
    showThumbnail: boolean;
    thumbnail: string;
    mediaType: string;
};

export type IndexedMediaBrowseBreadcrumb = {
    rowKey: string;
    label: string;
    folderPathJson: string;
};

export type IndexedMediaBrowseResult = {
    totalItems: number;
    folderPath: string[];
    folders: IndexedMediaBrowseFolderRow[];
    files: IndexedMediaBrowseFileRow[];
    breadcrumbs: IndexedMediaBrowseBreadcrumb[];
    indexRel: string;
    indexMissing: boolean;
};

type CatalogYamlItem = {
    id: string;
    title: string;
    folderPath?: string[];
    thumbnail?: string;
    prompt?: string;
};

function folderPathKey(folderPath: string[]): string {
    return folderPath.join('\u0001');
}

function parseMediaTypeFromPrompt(prompt?: string): string | undefined {
    if (!prompt) return undefined;
    const match = prompt.match(/Type:\s*([^\s·]+)/);
    return match?.[1]?.toLowerCase();
}

function parseUrlFromPrompt(prompt?: string): string | undefined {
    if (!prompt) return undefined;
    const match = prompt.match(/URL:\s*(https?:\/\/\S+)/);
    return match?.[1];
}

function normalizeFolderPath(folderPath: string[] | undefined): string[] {
    return folderPath ?? [];
}

function isPrefixPath(prefix: string[], full: string[]): boolean {
    if (prefix.length > full.length) return false;
    return prefix.every((segment, index) => full[index] === segment);
}

export function readIndexedMediaItems(projectRoot: string): {
    items: IndexedMediaFileRow[];
    indexRel: string;
    indexMissing: boolean;
} {
    const indexRel = ADD_MENU_GENERATED_REL;
    const indexPath = path.join(projectRoot, indexRel);
    if (!fs.existsSync(indexPath)) {
        return { items: [], indexRel, indexMissing: true };
    }

    const raw = fs.readFileSync(indexPath, 'utf-8');
    const parsed = loadYaml(raw) as { items?: CatalogYamlItem[] } | null;
    const items = (parsed?.items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        folderPath: normalizeFolderPath(item.folderPath),
        thumbnail: item.thumbnail,
        mediaType: parseMediaTypeFromPrompt(item.prompt),
        url: parseUrlFromPrompt(item.prompt),
    }));

    return { items, indexRel, indexMissing: false };
}

export function browseIndexedMediaCatalog(
    projectRoot: string,
    folderPath: string[] = [],
): IndexedMediaBrowseResult {
    const { items, indexRel, indexMissing } = readIndexedMediaItems(projectRoot);
    const catalogDocument = readMediaCatalogDocument(projectRoot);
    const normalizedPath = normalizeFolderPath(folderPath);

    const filesInFolder = items.filter(
        (item) => folderPathKey(item.folderPath) === folderPathKey(normalizedPath),
    );

    const childFolderCounts = new Map<string, number>();
    for (const item of items) {
        if (!isPrefixPath(normalizedPath, item.folderPath)) continue;
        if (item.folderPath.length <= normalizedPath.length) continue;
        const childName = item.folderPath[normalizedPath.length];
        if (!childName) continue;
        childFolderCounts.set(childName, (childFolderCounts.get(childName) ?? 0) + 1);
    }

    for (const emptyFolderPath of emptyFolderPathsForBrowse(catalogDocument, normalizedPath)) {
        const childName = emptyFolderPath[normalizedPath.length];
        if (!childName) continue;
        if (!childFolderCounts.has(childName)) {
            childFolderCounts.set(childName, 0);
        }
    }

    const folders: IndexedMediaBrowseFolderRow[] = [...childFolderCounts.entries()]
        .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
        .map(([name, count]) => {
            const childPath = [...normalizedPath, name];
            return {
                rowKey: `${folderPathKey(normalizedPath)}/${name}`,
                name,
                childCountLabel:
                    count === 0 ? 'empty' : `${count} item${count === 1 ? '' : 's'}`,
                folderPathJson: JSON.stringify(childPath),
            };
        });

    const files: IndexedMediaBrowseFileRow[] = filesInFolder
        .sort((left, right) => left.title.localeCompare(right.title))
        .map((item) => ({
            rowKey: item.id,
            title: item.title,
            showThumbnail: Boolean(item.thumbnail),
            thumbnail: item.thumbnail ?? '',
            mediaType: item.mediaType ?? 'unknown',
        }));

    const breadcrumbs: IndexedMediaBrowseBreadcrumb[] = [
        {
            rowKey: 'root',
            label: 'All media',
            folderPathJson: JSON.stringify([]),
        },
    ];
    for (let depth = 0; depth < normalizedPath.length; depth++) {
        const pathSegments = normalizedPath.slice(0, depth + 1);
        breadcrumbs.push({
            rowKey: folderPathKey(pathSegments),
            label: pathSegments[pathSegments.length - 1]!,
            folderPathJson: JSON.stringify(pathSegments),
        });
    }

    return {
        totalItems: items.length,
        folderPath: normalizedPath,
        folders,
        files,
        breadcrumbs,
        indexRel,
        indexMissing,
    };
}

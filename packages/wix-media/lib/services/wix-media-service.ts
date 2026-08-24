import { buildMediaFolderPath, type WixMediaFolderRecord } from '../add-menu/folder-path.js';
import { folderPathKey } from '../catalog/folder-path-keys.js';
import { WixClient } from '@wix/sdk';
import { files, folders } from '@wix/media';
import * as fs from 'node:fs';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import type { BuildDescriptors } from '@wix/sdk-types';

type FilesClient = BuildDescriptors<typeof files, {}>;
type FoldersClient = BuildDescriptors<typeof folders, {}>;

export interface MediaFileInfo {
    id: string;
    displayName: string;
    slug: string;
    url: string;
    mediaType: string;
    width?: number;
    height?: number;
    labels: string[];
    folderId: string;
    folderName: string;
    folderPath: string[];
}

export interface UploadUrlResult {
    uploadUrl: string;
}

export interface WixMediaService {
    listPublicFiles(): Promise<MediaFileInfo[]>;
    generateUploadUrl(mimeType: string, fileName: string): Promise<UploadUrlResult>;
    resolveFolderIdByPath(folderPath: string[]): Promise<string>;
    createFolder(displayName: string, parentFolderPath: string[]): Promise<{ folderId: string }>;
    uploadPublicFile(params: {
        fileName: string;
        mimeType: string;
        filePath: string;
        parentFolderPath: string[];
    }): Promise<void>;
    findPublicFileInParentFolder(
        parentFolderPath: string[],
        displayName: string,
    ): Promise<MediaFileInfo | null>;
}

export const WIX_MEDIA_SERVICE_MARKER = createJayService<WixMediaService>('Wix Media Service');

let filesClientInstance: FilesClient | undefined;
let foldersClientInstance: FoldersClient | undefined;

function getFilesClient(wixClient: WixClient): FilesClient {
    if (!filesClientInstance) {
        filesClientInstance = wixClient.use(files);
    }
    return filesClientInstance;
}

function getFoldersClient(wixClient: WixClient): FoldersClient {
    if (!foldersClientInstance) {
        foldersClientInstance = wixClient.use(folders);
    }
    return foldersClientInstance;
}

function toSlug(displayName: string): string {
    return displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function deduplicateSlugs(items: { slug: string }[]): void {
    const seen = new Map<string, number>();
    for (const item of items) {
        const count = seen.get(item.slug) ?? 0;
        if (count > 0) {
            item.slug = `${item.slug}-${count + 1}`;
        }
        seen.set(item.slug, count + 1);
    }
}

function extractDimensions(file: {
    media?: { image?: { image?: string }; vector?: { image?: string } };
    url?: string;
}): { width?: number; height?: number } {
    const url = file.url ?? '';
    const widthMatch = url.match(/originWidth=(\d+)/);
    const heightMatch = url.match(/originHeight=(\d+)/);
    if (widthMatch && heightMatch) {
        return { width: parseInt(widthMatch[1], 10), height: parseInt(heightMatch[1], 10) };
    }
    return {};
}

async function fetchAllFolders(
    foldersClient: FoldersClient,
): Promise<Map<string, WixMediaFolderRecord>> {
    const folderMap = new Map<string, WixMediaFolderRecord>();
    folderMap.set('media-root', { name: 'Media Root', parentFolderId: null });

    let cursor: string | undefined | null;
    do {
        const result = await foldersClient.searchFolders({
            rootFolder: 'MEDIA_ROOT',
            paging: cursor ? { cursor, limit: 100 } : { limit: 100 },
        });
        for (const folder of result.folders ?? []) {
            if (folder._id && folder.displayName) {
                folderMap.set(folder._id, {
                    name: folder.displayName,
                    parentFolderId: folder.parentFolderId ?? null,
                });
            }
        }
        cursor = result.nextCursor?.cursors?.next;
    } while (cursor);

    return folderMap;
}

async function fetchAllPublicFiles(filesClient: FilesClient): Promise<
    Array<{
        id: string;
        displayName: string;
        url: string;
        mediaType: string;
        labels: string[];
        folderId: string;
        media?: any;
    }>
> {
    const allFiles: Array<{
        id: string;
        displayName: string;
        url: string;
        mediaType: string;
        labels: string[];
        folderId: string;
        media?: any;
    }> = [];

    let cursor: string | undefined | null;
    do {
        const result = await filesClient.searchFiles({
            rootFolder: 'MEDIA_ROOT',
            private: false,
            paging: cursor ? { cursor, limit: 100 } : { limit: 100 },
            sort: { fieldName: 'displayName', order: 'ASC' },
        });

        for (const file of result.files ?? []) {
            if (file.state !== 'OK' || !file._id) continue;
            allFiles.push({
                id: file._id,
                displayName: file.displayName ?? file._id,
                url: file.url ?? '',
                mediaType: (file.mediaType ?? 'UNKNOWN').toLowerCase(),
                labels: file.labels ?? [],
                folderId: file.parentFolderId ?? 'media-root',
                media: file.media,
            });
        }

        cursor = result.nextCursor?.cursors?.next;
    } while (cursor);

    return allFiles;
}

function fileParentFolderId(parentFolderId: string | undefined | null): string {
    return parentFolderId ?? 'media-root';
}

function fileMatchesParentFolder(
    fileParentFolderIdValue: string | undefined | null,
    expectedParentFolderId: string,
): boolean {
    return fileParentFolderId(fileParentFolderIdValue) === expectedParentFolderId;
}

function mapRawFileToMediaFileInfo(
    file: {
        id: string;
        displayName: string;
        url: string;
        mediaType: string;
        labels: string[];
        folderId: string;
        media?: any;
    },
    folderMap: Map<string, WixMediaFolderRecord>,
): MediaFileInfo {
    const dims = extractDimensions(file);
    const folderRecord = folderMap.get(file.folderId);
    const folderName = folderRecord?.name ?? 'Unknown';
    const folderPath = buildMediaFolderPath(file.folderId, folderMap);
    return {
        id: file.id,
        displayName: file.displayName,
        slug: toSlug(file.displayName),
        url: file.url,
        mediaType: file.mediaType,
        width: dims.width,
        height: dims.height,
        labels: file.labels,
        folderId: file.folderId,
        folderName,
        folderPath,
    };
}
function resolveFolderIdByPathFromIndex(
    folderPath: string[],
    folderMap: Map<string, WixMediaFolderRecord>,
): string {
    const normalizedPath = folderPath;
    if (normalizedPath.length === 0) {
        return 'media-root';
    }

    for (const [folderId] of folderMap) {
        const pathSegments = buildMediaFolderPath(folderId, folderMap);
        if (folderPathKey(pathSegments) === folderPathKey(normalizedPath)) {
            return folderId;
        }
    }

    throw new Error(`Folder not found in Wix Media Manager: ${normalizedPath.join(' / ')}`);
}

export function provideWixMediaService(wixClient: WixClient): WixMediaService {
    const filesClient = getFilesClient(wixClient);
    const foldersClient = getFoldersClient(wixClient);

    const service: WixMediaService = {
        async generateUploadUrl(mimeType: string, fileName: string): Promise<UploadUrlResult> {
            const result = await filesClient.generateFileUploadUrl(mimeType, {
                fileName,
            });
            return { uploadUrl: result.uploadUrl ?? '' };
        },

        async listPublicFiles(): Promise<MediaFileInfo[]> {
            const [folderMap, rawFiles] = await Promise.all([
                fetchAllFolders(foldersClient),
                fetchAllPublicFiles(filesClient),
            ]);

            const items: MediaFileInfo[] = rawFiles.map((file) =>
                mapRawFileToMediaFileInfo(file, folderMap),
            );

            deduplicateSlugs(items);

            items.sort((a, b) => {
                const folderCmp = a.folderName.localeCompare(b.folderName);
                if (folderCmp !== 0) return folderCmp;
                return a.slug.localeCompare(b.slug);
            });

            return items;
        },

        async resolveFolderIdByPath(folderPath: string[]): Promise<string> {
            const folderMap = await fetchAllFolders(foldersClient);
            return resolveFolderIdByPathFromIndex(folderPath, folderMap);
        },

        async createFolder(
            displayName: string,
            parentFolderPath: string[],
        ): Promise<{ folderId: string }> {
            const trimmedName = displayName.trim();
            if (!trimmedName) {
                throw new Error('Folder name is required.');
            }

            const parentFolderId = await this.resolveFolderIdByPath(parentFolderPath);
            const result = await foldersClient.createFolder(trimmedName, {
                parentFolderId,
            });
            const folderId = result.folder?._id;
            if (!folderId) {
                throw new Error('Wix Media Manager did not return a folder id.');
            }
            return { folderId };
        },

        async uploadPublicFile(params: {
            fileName: string;
            mimeType: string;
            filePath: string;
            parentFolderPath: string[];
        }): Promise<void> {
            const parentFolderId = await this.resolveFolderIdByPath(params.parentFolderPath);
            const { uploadUrl } = await filesClient.generateFileUploadUrl(params.mimeType, {
                fileName: params.fileName,
                parentFolderId,
            });
            if (!uploadUrl) {
                throw new Error('Wix Media Manager did not return an upload URL.');
            }

            const fileBuffer = fs.readFileSync(params.filePath);
            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': params.mimeType },
                body: fileBuffer,
            });
            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}.`);
            }
        },

        async findPublicFileInParentFolder(
            parentFolderPath: string[],
            displayName: string,
        ): Promise<MediaFileInfo | null> {
            const folderMap = await fetchAllFolders(foldersClient);
            const parentFolderId = resolveFolderIdByPathFromIndex(parentFolderPath, folderMap);

            let cursor: string | undefined | null;
            do {
                const result = await filesClient.searchFiles({
                    rootFolder: 'MEDIA_ROOT',
                    private: false,
                    paging: cursor ? { cursor, limit: 100 } : { limit: 100 },
                    sort: { fieldName: 'displayName', order: 'ASC' },
                });

                for (const file of result.files ?? []) {
                    if (file.state !== 'OK' || !file._id) continue;
                    if (!fileMatchesParentFolder(file.parentFolderId, parentFolderId)) continue;
                    if (file.displayName !== displayName) continue;

                    const rawFile = {
                        id: file._id,
                        displayName: file.displayName ?? file._id,
                        url: file.url ?? '',
                        mediaType: (file.mediaType ?? 'UNKNOWN').toLowerCase(),
                        labels: file.labels ?? [],
                        folderId: fileParentFolderId(file.parentFolderId),
                        media: file.media,
                    };
                    return mapRawFileToMediaFileInfo(rawFile, folderMap);
                }

                cursor = result.nextCursor?.cursors?.next;
            } while (cursor);

            return null;
        },
    };

    registerService(WIX_MEDIA_SERVICE_MARKER, service);
    return service;
}

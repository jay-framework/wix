import { buildMediaFolderPath, type WixMediaFolderRecord } from '../add-menu/folder-path.js';
import { WixClient } from '@wix/sdk';
import { files, folders } from '@wix/media';
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

            const items: MediaFileInfo[] = rawFiles.map((file) => {
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
            });

            deduplicateSlugs(items);

            items.sort((a, b) => {
                const folderCmp = a.folderName.localeCompare(b.folderName);
                if (folderCmp !== 0) return folderCmp;
                return a.slug.localeCompare(b.slug);
            });

            return items;
        },
    };

    registerService(WIX_MEDIA_SERVICE_MARKER, service);
    return service;
}

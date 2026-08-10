import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';
import type { JayFile } from '@jay-framework/fullstack-component';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import type { WixClient } from '@wix/sdk';

import { browseIndexedMediaCatalog } from './catalog/read-indexed-catalog.js';
import {
    registerEmptyFolderInCatalog,
    appendMediaFileToCatalog,
} from './catalog/incremental-catalog-patch.js';
import { refreshMediaProjectCatalog } from './catalog/refresh-media-project-catalog.js';
import type {
    MediaFileUploadResult,
    MediaFolderCreateResult,
    MediaOperationStepResult,
} from './media-operation-result.js';
import { provideWixMediaService } from './services/wix-media-service.js';
import type { MediaFileInfo, WixMediaService } from './services/wix-media-service.js';

function mediaServiceForClient(wixClientService: { wixClient?: WixClient } | WixClient) {
    const wixClient =
        typeof wixClientService === 'object' &&
        wixClientService !== null &&
        'wixClient' in wixClientService &&
        wixClientService.wixClient
            ? wixClientService.wixClient
            : (wixClientService as unknown as WixClient);
    return provideWixMediaService(wixClient);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function wait(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function resolveUploadedFileWithRetry(
    mediaService: WixMediaService,
    parentFolderPath: string[],
    fileName: string,
): Promise<MediaFileInfo> {
    const retryDelaysMs = [0, 500, 1500, 3000];

    for (const delayMs of retryDelaysMs) {
        if (delayMs > 0) {
            await wait(delayMs);
        }

        const file = await mediaService.findPublicFileInParentFolder(parentFolderPath, fileName);
        if (file) {
            return file;
        }
    }

    throw new Error(
        `Uploaded "${fileName}" to Wix but it is not visible in the folder yet. ` +
            'Wait a few seconds and click Rebuild media catalog, or retry the upload.',
    );
}

export const getMediaSettingsStatus = makeJayQuery('wixMedia.getMediaSettingsStatus')
    .withServices(WIX_CLIENT_SERVICE)
    .withHandler(async (_input, wixClient) => {
        try {
            const mediaService = mediaServiceForClient(wixClient);
            const files = await mediaService.listPublicFiles();
            return {
                connected: true,
                fileCount: files.length,
                message: `Connected to Wix Media Manager (${files.length} public files).`,
            };
        } catch (error) {
            return {
                connected: false,
                fileCount: 0,
                message:
                    error instanceof Error
                        ? error.message
                        : 'Wix Media Manager is not available. Configure wix-server-client first.',
            };
        }
    });

export const listIndexedMediaBrowse = makeJayQuery('wixMedia.listIndexedMediaBrowse').withHandler(
    async (input: { folderPath?: string[] }) => {
        return browseIndexedMediaCatalog(process.cwd(), input.folderPath ?? []);
    },
);

export const rebuildMediaCatalog = makeJayQuery('wixMedia.rebuildMediaCatalog')
    .withServices(WIX_CLIENT_SERVICE)
    .withHandler(async (_input, wixClient) => {
        const mediaService = mediaServiceForClient(wixClient);
        const result = await refreshMediaProjectCatalog(process.cwd(), mediaService);
        return result;
    });

export const createMediaFolder = makeJayAction('wixMedia.createMediaFolder')
    .withServices(WIX_CLIENT_SERVICE)
    .withHandler(
        async (
            input: { name: string; parentFolderPath?: string[] },
            wixClient,
        ): Promise<MediaFolderCreateResult> => {
            const mediaService = mediaServiceForClient(wixClient);
            const parentFolderPath = input.parentFolderPath ?? [];
            const trimmedName = input.name.trim();
            const folderPath = [...parentFolderPath, trimmedName];
            const steps: MediaOperationStepResult[] = [];

            if (!trimmedName) {
                return {
                    success: false,
                    folderPath,
                    steps: [
                        {
                            id: 'wix-remote',
                            status: 'failed',
                            detail: 'Folder name is required.',
                        },
                    ],
                    itemCount: 0,
                    emptyFolderCount: 0,
                };
            }

            let folderId: string | undefined;
            try {
                const created = await mediaService.createFolder(trimmedName, parentFolderPath);
                folderId = created.folderId;
                steps.push({
                    id: 'wix-remote',
                    status: 'success',
                    detail: `Created folder "${trimmedName}" in Wix (id: ${folderId}).`,
                });
            } catch (error) {
                steps.push({
                    id: 'wix-remote',
                    status: 'failed',
                    detail: errorMessage(error),
                });
                return {
                    success: false,
                    folderPath,
                    steps,
                    itemCount: 0,
                    emptyFolderCount: 0,
                };
            }

            try {
                const patch = registerEmptyFolderInCatalog(process.cwd(), folderPath);
                steps.push({
                    id: 'local-catalog',
                    status: 'success',
                    detail:
                        `Registered empty folder in ${patch.outputRel} ` +
                        `(${patch.itemCount} indexed files, ${patch.emptyFolderCount} empty folders tracked).`,
                });
                return {
                    success: true,
                    folderId,
                    folderPath,
                    steps,
                    itemCount: patch.itemCount,
                    emptyFolderCount: patch.emptyFolderCount,
                };
            } catch (error) {
                steps.push({
                    id: 'local-catalog',
                    status: 'failed',
                    detail:
                        `${errorMessage(error)} ` +
                        'The folder exists in Wix but is missing from the local index. ' +
                        'Run Rebuild media catalog to fix the index, or retry creating the folder.',
                });
                return {
                    success: false,
                    folderId,
                    folderPath,
                    steps,
                    itemCount: 0,
                    emptyFolderCount: 0,
                };
            }
        },
    );

export const uploadMediaFile = makeJayAction('wixMedia.uploadMediaFile')
    .withServices(WIX_CLIENT_SERVICE)
    .withFiles()
    .withHandler(
        async (
            input: { file: JayFile; parentFolderPath?: string[] },
            wixClient,
        ): Promise<MediaFileUploadResult> => {
            if (!input.file) {
                return {
                    success: false,
                    fileName: '',
                    folderPath: input.parentFolderPath ?? [],
                    steps: [
                        {
                            id: 'wix-remote',
                            status: 'failed',
                            detail: 'No file was selected for upload.',
                        },
                    ],
                    itemCount: 0,
                };
            }

            const mediaService = mediaServiceForClient(wixClient);
            const parentFolderPath = input.parentFolderPath ?? [];
            const fileName = input.file.name;
            const steps: MediaOperationStepResult[] = [];

            try {
                await mediaService.uploadPublicFile({
                    fileName,
                    mimeType: input.file.type || 'application/octet-stream',
                    filePath: input.file.path,
                    parentFolderPath,
                });
                steps.push({
                    id: 'wix-remote',
                    status: 'success',
                    detail: `Uploaded "${fileName}" to Wix in ${folderLabel(parentFolderPath)}.`,
                });
            } catch (error) {
                steps.push({
                    id: 'wix-remote',
                    status: 'failed',
                    detail: errorMessage(error),
                });
                return {
                    success: false,
                    fileName,
                    folderPath: parentFolderPath,
                    steps,
                    itemCount: 0,
                };
            }

            try {
                const uploadedFile = await resolveUploadedFileWithRetry(
                    mediaService,
                    parentFolderPath,
                    fileName,
                );
                const patch = appendMediaFileToCatalog(process.cwd(), uploadedFile);
                steps.push({
                    id: 'local-catalog',
                    status: 'success',
                    detail:
                        `Added "${fileName}" to ${patch.outputRel} ` +
                        `(${patch.itemCount} indexed files total).`,
                });
                return {
                    success: true,
                    fileName,
                    fileId: uploadedFile.id,
                    folderPath: parentFolderPath,
                    steps,
                    itemCount: patch.itemCount,
                };
            } catch (error) {
                steps.push({
                    id: 'local-catalog',
                    status: 'failed',
                    detail:
                        `${errorMessage(error)} ` +
                        'The file is in Wix but not in the local index yet. ' +
                        'Run Rebuild media catalog to index it, or retry the upload.',
                });
                return {
                    success: false,
                    fileName,
                    folderPath: parentFolderPath,
                    steps,
                    itemCount: 0,
                };
            }
        },
    );

function folderLabel(folderPath: string[]): string {
    if (folderPath.length === 0) return 'All media';
    return folderPath.join(' / ');
}

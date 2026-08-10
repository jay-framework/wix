import {
    makeJayStackComponent,
    PageProps,
    phaseOutput,
    Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';

import { parseFolderPathJson } from '../../catalog/folder-path-keys.js';
import type {
    IndexedMediaBrowseBreadcrumb,
    IndexedMediaBrowseFileRow,
    IndexedMediaBrowseFolderRow,
} from '../../catalog/read-indexed-catalog.js';
import {
    formatMediaOperationMessage,
    type MediaFileUploadResult,
    type MediaFolderCreateResult,
    type MediaOperationStepResult,
} from '../../media-operation-result.js';
import {
    createMediaFolder,
    getMediaSettingsStatus,
    listIndexedMediaBrowse,
    rebuildMediaCatalog,
    uploadMediaFile,
} from '../../settings-actions.js';

type StatusTone = 'info' | 'success' | 'warning' | 'error';

type PageFastViewState = {
    connectionMessage: string;
    connected: boolean;
    fileCount: number;
    statusMessage: string;
    statusTone: StatusTone;
    showStatusMessage: boolean;
    indexedTotalItems: number;
    indexMissing: boolean;
    browseFolderLabel: string;
    browseFolders: IndexedMediaBrowseFolderRow[];
    browseFiles: IndexedMediaBrowseFileRow[];
    browseBreadcrumbs: IndexedMediaBrowseBreadcrumb[];
    showBrowseEmpty: boolean;
    showBrowseFolders: boolean;
    showBrowseFiles: boolean;
    newFolderName: string;
};

type PageElementRefs = {
    rebuildCatalogBtn: { onclick: (handler: () => void) => void };
    refreshStatusBtn: { onclick: (handler: () => void) => void };
    createFolderBtn: { onclick: (handler: () => void) => void };
    newFolderNameInput: {
        oninput: (handler: (event: { event: Event }) => void) => void;
    };
    uploadFileInput: {
        onchange: (handler: (event: { event: Event }) => void) => void;
    };
    browseFoldersList: {
        onclick: (handler: (event: { event: Event }) => void) => void;
    };
    browseBreadcrumbsList: {
        onclick: (handler: (event: { event: Event }) => void) => void;
    };
};

function folderLabel(folderPath: string[]): string {
    if (folderPath.length === 0) return 'All media';
    return folderPath.join(' / ');
}

function notifyAddMenuChanged(): void {
    window.parent.postMessage({ type: 'aiditor:addMenuCatalogChanged' }, window.location.origin);
}

function toneForOperationResult(success: boolean, steps: MediaOperationStepResult[]): StatusTone {
    if (success) return 'success';
    const remoteFailed = steps.some((step) => step.id === 'wix-remote' && step.status === 'failed');
    return remoteFailed ? 'error' : 'warning';
}

function setOperationStatus(
    setStatusMessage: (value: string) => void,
    setStatusTone: (value: StatusTone) => void,
    setShowStatusMessage: (value: boolean) => void,
    headline: string,
    result: { success: boolean; steps: MediaOperationStepResult[] },
): void {
    setStatusMessage(formatMediaOperationMessage(headline, result.steps));
    setStatusTone(toneForOperationResult(result.success, result.steps));
    setShowStatusMessage(true);
}

async function renderFast(_props: PageProps) {
    const browse = await listIndexedMediaBrowse({});
    return phaseOutput<PageFastViewState, {}>(
        {
            connectionMessage: 'Checking connection…',
            connected: false,
            fileCount: 0,
            statusMessage: '',
            statusTone: 'info',
            showStatusMessage: false,
            indexedTotalItems: browse.totalItems,
            indexMissing: browse.indexMissing,
            browseFolderLabel: folderLabel(browse.folderPath),
            browseFolders: browse.folders,
            browseFiles: browse.files,
            browseBreadcrumbs: browse.breadcrumbs,
            showBrowseEmpty: browse.folders.length === 0 && browse.files.length === 0,
            showBrowseFolders: browse.folders.length > 0,
            showBrowseFiles: browse.files.length > 0,
            newFolderName: '',
        },
        {},
    );
}

function settingsPageConstructor(
    _props: Props<PageProps>,
    refs: PageElementRefs,
    fastViewState: Signals<PageFastViewState>,
) {
    const [connectionMessage, setConnectionMessage] = createSignal(
        fastViewState.connectionMessage[0](),
    );
    const [connected, setConnected] = createSignal(fastViewState.connected[0]());
    const [fileCount, setFileCount] = createSignal(fastViewState.fileCount[0]());
    const [statusMessage, setStatusMessage] = createSignal(fastViewState.statusMessage[0]());
    const [statusTone, setStatusTone] = createSignal(fastViewState.statusTone[0]());
    const [showStatusMessage, setShowStatusMessage] = createSignal(
        fastViewState.showStatusMessage[0](),
    );
    const [indexedTotalItems, setIndexedTotalItems] = createSignal(
        fastViewState.indexedTotalItems[0](),
    );
    const [indexMissing, setIndexMissing] = createSignal(fastViewState.indexMissing[0]());
    const [browseFolderPath, setBrowseFolderPath] = createSignal<string[]>([]);
    const [browseFolderLabel, setBrowseFolderLabel] = createSignal(
        fastViewState.browseFolderLabel[0](),
    );
    const [browseFolders, setBrowseFolders] = createSignal<IndexedMediaBrowseFolderRow[]>(
        fastViewState.browseFolders[0](),
    );
    const [browseFiles, setBrowseFiles] = createSignal<IndexedMediaBrowseFileRow[]>(
        fastViewState.browseFiles[0](),
    );
    const [browseBreadcrumbs, setBrowseBreadcrumbs] = createSignal<IndexedMediaBrowseBreadcrumb[]>(
        fastViewState.browseBreadcrumbs[0](),
    );
    const [showBrowseEmpty, setShowBrowseEmpty] = createSignal(fastViewState.showBrowseEmpty[0]());
    const [showBrowseFolders, setShowBrowseFolders] = createSignal(
        fastViewState.showBrowseFolders[0](),
    );
    const [showBrowseFiles, setShowBrowseFiles] = createSignal(fastViewState.showBrowseFiles[0]());
    const [newFolderName, setNewFolderName] = createSignal(fastViewState.newFolderName[0]());

    async function loadBrowse(folderPath: string[] = browseFolderPath()) {
        const browse = await listIndexedMediaBrowse({ folderPath });
        setBrowseFolderPath(browse.folderPath);
        setBrowseFolderLabel(folderLabel(browse.folderPath));
        setBrowseFolders(browse.folders);
        setBrowseFiles(browse.files);
        setBrowseBreadcrumbs(browse.breadcrumbs);
        setShowBrowseEmpty(browse.folders.length === 0 && browse.files.length === 0);
        setShowBrowseFolders(browse.folders.length > 0);
        setShowBrowseFiles(browse.files.length > 0);
        setIndexedTotalItems(browse.totalItems);
        setIndexMissing(browse.indexMissing);
    }

    async function refreshStatus() {
        const status = await getMediaSettingsStatus({});
        setConnectionMessage(status.message);
        setConnected(status.connected);
        setFileCount(status.fileCount);
    }

    refs.rebuildCatalogBtn.onclick(async () => {
        setStatusMessage('Rebuilding media catalog from Wix…');
        setStatusTone('info');
        setShowStatusMessage(true);
        try {
            const result = await rebuildMediaCatalog({});
            setStatusMessage(`Catalog rebuilt (${result.itemCount} items → ${result.outputRel}).`);
            setStatusTone('success');
            await refreshStatus();
            await loadBrowse(browseFolderPath());
            notifyAddMenuChanged();
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Rebuild failed.');
            setStatusTone('error');
        }
    });

    refs.refreshStatusBtn.onclick(() => {
        void refreshStatus();
    });

    refs.createFolderBtn.onclick(async () => {
        const folderName = newFolderName().trim();
        if (!folderName) {
            setStatusMessage('Enter a folder name first.');
            setStatusTone('warning');
            setShowStatusMessage(true);
            return;
        }

        setStatusMessage(`Creating folder "${folderName}" in Wix…`);
        setStatusTone('info');
        setShowStatusMessage(true);
        try {
            const result: MediaFolderCreateResult = await createMediaFolder({
                name: folderName,
                parentFolderPath: browseFolderPath(),
            });
            setOperationStatus(
                setStatusMessage,
                setStatusTone,
                setShowStatusMessage,
                result.success
                    ? `Folder "${folderName}" is ready for uploads.`
                    : `Folder "${folderName}" could not be fully set up.`,
                result,
            );

            if (result.success) {
                setNewFolderName('');
                await loadBrowse(result.folderPath);
                notifyAddMenuChanged();
            } else if (result.folderId) {
                await refreshStatus();
            }
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Create folder failed.');
            setStatusTone('error');
        }
    });

    refs.newFolderNameInput.oninput(({ event }) => {
        setNewFolderName((event.target as HTMLInputElement).value);
    });

    refs.uploadFileInput.onchange(async ({ event }) => {
        const input = event.target as HTMLInputElement;
        const selectedFile = input.files?.[0];
        if (!selectedFile) return;

        setStatusMessage(`Uploading "${selectedFile.name}" to Wix…`);
        setStatusTone('info');
        setShowStatusMessage(true);
        try {
            const result: MediaFileUploadResult = await uploadMediaFile({
                file: selectedFile,
                parentFolderPath: browseFolderPath(),
            });
            input.value = '';
            setOperationStatus(
                setStatusMessage,
                setStatusTone,
                setShowStatusMessage,
                result.success
                    ? `Uploaded "${result.fileName}".`
                    : `Upload for "${result.fileName}" did not complete.`,
                result,
            );

            if (result.success) {
                await refreshStatus();
                await loadBrowse(browseFolderPath());
                notifyAddMenuChanged();
            } else if (
                result.steps.some((step) => step.id === 'wix-remote' && step.status === 'success')
            ) {
                await refreshStatus();
            }
        } catch (error) {
            input.value = '';
            setStatusMessage(error instanceof Error ? error.message : 'Upload failed.');
            setStatusTone('error');
        }
    });

    refs.browseFoldersList.onclick(({ event }) => {
        const target = (event.target as HTMLElement).closest('[data-folder-path-json]');
        if (!(target instanceof HTMLElement)) return;
        const folderPathJson = target.dataset.folderPathJson;
        if (!folderPathJson) return;
        void loadBrowse(parseFolderPathJson(folderPathJson));
    });

    refs.browseBreadcrumbsList.onclick(({ event }) => {
        const target = (event.target as HTMLElement).closest('[data-folder-path-json]');
        if (!(target instanceof HTMLElement)) return;
        const folderPathJson = target.dataset.folderPathJson;
        if (!folderPathJson) return;
        void loadBrowse(parseFolderPathJson(folderPathJson));
    });

    void refreshStatus();

    return {
        render: () => ({
            connectionMessage: connectionMessage(),
            connected: connected(),
            fileCount: fileCount(),
            statusMessage: statusMessage(),
            statusTone: statusTone(),
            showStatusMessage: showStatusMessage(),
            indexedTotalItems: indexedTotalItems(),
            indexMissing: indexMissing(),
            browseFolderLabel: browseFolderLabel(),
            browseFolders: browseFolders(),
            browseFiles: browseFiles(),
            browseBreadcrumbs: browseBreadcrumbs(),
            showBrowseEmpty: showBrowseEmpty(),
            showBrowseFolders: showBrowseFolders(),
            showBrowseFiles: showBrowseFiles(),
            newFolderName: newFolderName(),
        }),
    };
}

export const mediaSettingsPage = makeJayStackComponent()
    .withProps<PageProps>()
    .withFastRender(renderFast)
    .withInteractive(settingsPageConstructor);

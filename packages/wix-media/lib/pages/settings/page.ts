import {
    makeJayStackComponent,
    PageProps,
    phaseOutput,
    Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import { getMediaSettingsStatus, rebuildMediaCatalog } from '../../settings-actions.js';

type PageFastViewState = {
    connectionMessage: string;
    connected: boolean;
    fileCount: number;
    statusMessage: string;
};

type PageElementRefs = {
    rebuildCatalogBtn: { onclick: (handler: () => void) => void };
    refreshStatusBtn: { onclick: (handler: () => void) => void };
};

async function renderFast(_props: PageProps) {
    const status = await getMediaSettingsStatus({});
    return phaseOutput<PageFastViewState, {}>(
        {
            connectionMessage: status.message,
            connected: status.connected,
            fileCount: status.fileCount,
            statusMessage: '',
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

    async function refreshStatus() {
        const status = await getMediaSettingsStatus({});
        setConnectionMessage(status.message);
        setConnected(status.connected);
        setFileCount(status.fileCount);
    }

    refs.rebuildCatalogBtn.onclick(async () => {
        setStatusMessage('Rebuilding media catalog…');
        try {
            const result = await rebuildMediaCatalog({});
            setStatusMessage(`Catalog rebuilt (${result.itemCount} items → ${result.outputRel}).`);
            await refreshStatus();
            window.parent.postMessage(
                { type: 'aiditor:addMenuCatalogChanged' },
                window.location.origin,
            );
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Rebuild failed.');
        }
    });

    refs.refreshStatusBtn.onclick(() => {
        void refreshStatus();
    });

    return {
        render: () => ({
            connectionMessage: connectionMessage(),
            connected: connected(),
            fileCount: fileCount(),
            statusMessage: statusMessage(),
        }),
    };
}

export const mediaSettingsPage = makeJayStackComponent()
    .withProps<PageProps>()
    .withFastRender(renderFast)
    .withInteractive(settingsPageConstructor);

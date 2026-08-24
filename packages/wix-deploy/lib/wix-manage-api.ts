const MANAGE_BASE = 'https://manage.wix.com';

export interface WixManageClient {
    fetch<T = unknown>(
        path: string,
        options?: { method?: string; body?: unknown; params?: Record<string, string> },
    ): Promise<T>;
}

export function createWixManageClient(accessToken: string): WixManageClient {
    const headers = {
        Authorization: accessToken,
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': 'nocheck',
        Cookie: 'XSRF-TOKEN=nocheck',
    };

    return {
        async fetch<T = unknown>(
            path: string,
            options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
        ): Promise<T> {
            const { method = 'GET', body, params } = options;
            const url = new URL(path, MANAGE_BASE);
            if (params) {
                for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
            }
            const response = await fetch(url.toString(), {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Wix API ${response.status} ${path}: ${text}`);
            }
            const text = await response.text();
            return (text ? JSON.parse(text) : {}) as T;
        },
    };
}

// --- App Deployments API ---

interface StaticFileMetadata {
    path: string;
    hash: string;
    contentType: string;
    size: number;
}

interface StaticFileUploadUrl {
    uploadUrl?: string;
    staticFileMetadata?: { path: string };
}

interface UploadBucket {
    hashes?: string[];
}

interface AppDeployment {
    id?: string;
    appProjectId?: string;
    deploymentBaseUrl?: string;
    cloudProviderOverride?: string;
    [key: string]: unknown;
}

interface CreateDeploymentResponse {
    appDeployment: AppDeployment;
    staticFilesUploadUrls: StaticFileUploadUrl[];
    uploadAuthToken: string;
    uploadBuckets: UploadBucket[];
}

interface CompleteDeploymentResponse {
    appDeployment: AppDeployment;
}

export async function createAppDeployment(
    client: WixManageClient,
    appId: string,
    staticFilesMetadata: StaticFileMetadata[],
): Promise<CreateDeploymentResponse> {
    return client.fetch<CreateDeploymentResponse>(
        `/_api/wix-code-app-deployments/v1/app-projects/${appId}/app-deployments`,
        {
            method: 'POST',
            body: { appDeployment: { appProjectId: appId, staticFilesMetadata } },
        },
    );
}

interface BackendFile {
    path: string;
    content: string;
}

export async function completeAppDeployment(
    client: WixManageClient,
    appId: string,
    deployment: AppDeployment,
    backendFiles: BackendFile[],
    staticsCompletionToken: string,
): Promise<CompleteDeploymentResponse> {
    return client.fetch<CompleteDeploymentResponse>(
        `/_api/wix-code-app-deployments/v1/app-projects/${appId}/app-deployments/${deployment.id}/complete`,
        {
            method: 'POST',
            body: {
                appDeployment: { ...deployment, files: backendFiles },
                staticsCompletionToken,
            },
        },
    );
}

// --- App Versions API ---

interface AppVersionResponse {
    appVersion?: { version?: number };
}

export async function getLatestProductionVersion(
    client: WixManageClient,
    appId: string,
): Promise<number> {
    const data = await client.fetch<AppVersionResponse>(
        '/_api/app-versions/v1/app-versions/get-latest-production',
        { params: { appId } },
    );
    return data.appVersion?.version || 0;
}

// --- Components Overrides API ---

interface ModifiedComponent {
    componentId: string;
    type: string;
    data: {
        backendWorker: {
            deploymentId: string | undefined;
            deploymentUrl: string;
        };
    };
}

export async function createComponentsOverride(
    client: WixManageClient,
    override: {
        appId: string;
        appVersion: number;
        externalId: string;
        id: string;
        modifiedComponents: ModifiedComponent[];
    },
): Promise<void> {
    await client.fetch('/_api/components-overrides/v1/components-override', {
        method: 'POST',
        body: { componentsOverride: override },
    });
}

// --- Release API ---

interface ReleaseResponse {
    releaseBaseUrl?: string;
}

export async function releaseBaas(
    client: WixManageClient,
    appId: string,
    componentOverrideId: string,
): Promise<ReleaseResponse> {
    return client.fetch<ReleaseResponse>(
        `/apps-release-manager-service-web/apps/release/${appId}/${componentOverrideId}`,
        {
            method: 'POST',
            body: { appId, componentOverrideId, createMinorVersion: true },
        },
    );
}

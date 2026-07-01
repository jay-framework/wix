export const DEFAULT_COLLECTION_ID = 'jay-backend-files';
export const DEFAULT_CACHE_DIR = '/tmp/jay-backend';

export interface BuildMetadata {
    version: string;
    sourceHash: string;
    buildTimestamp: string;
    nodeVersion: string;
    instanceCount: number;
}

export function getDeployVersion(metadata: BuildMetadata): string {
    const version = metadata.version || '0.0.0';
    const hash = metadata.sourceHash || '';
    if (!hash) return version;
    return `${version}-${hash}`;
}

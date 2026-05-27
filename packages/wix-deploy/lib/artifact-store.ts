/**
 * WixDataArtifactStore — implements ArtifactStore for Wix BaaS deployments.
 *
 * Fetches backend build artifacts from a Wix data collection and caches them
 * to the local temp disk (/tmp). Eager files (manifest, shared modules) are
 * loaded on init. Lazy files (per-page server elements, cache data) are
 * fetched on first request for that page.
 *
 * The data collection is the authoritative source — the renderer server writes
 * updated pages there when products/CMS data changes.
 */

import { createClient, ApiKeyStrategy } from '@wix/sdk';
import { items } from '@wix/data';

type WixDataClient = ReturnType<typeof createWixDataClient>;
function createWixDataClient(apiKey: string, siteId: string) {
    return createClient({
        auth: ApiKeyStrategy({ apiKey, siteId }),
        modules: { items },
    });
}

// ArtifactStore interface from @jay-framework/production-server (DL#143).
// Duplicated here because the package doesn't export it from its main entry yet.
// When production-server adds an exports map with /serve, switch to importing from there.
export interface RouteManifest {
    version: number;
    buildTimestamp: string;
    sourceHash: string;
    projectRoot: string;
    sharedManifest: Record<string, string>;
    routes: any[];
    actions: any[];
    plugins: any[];
}

export interface PreRenderedEntry {
    content: string;
    slowViewState: object;
    carryForward: object;
}

export interface ServerElementModule {
    renderToStream: (vs: object, ctx: any) => void;
}

export interface ArtifactStore {
    readManifest(): Promise<RouteManifest>;
    readPreRenderedHtml(relativePath: string): Promise<PreRenderedEntry>;
    loadServerElement(relativePath: string): Promise<ServerElementModule>;
    getAssetPath(relativePath: string): string;
    getBuildDir(): string;
}
import fs from 'node:fs';
import path from 'node:path';

export interface WixDataArtifactStoreOptions {
    collectionId: string;
    cacheDir: string;
    apiKey: string;
    siteId: string;
}

interface DataCollectionItem {
    _id?: string;
    path: string;
    content: string;
    fileType: string;
    sizeBytes: number;
    category: 'eager' | 'lazy';
}

export class WixDataArtifactStore implements ArtifactStore {
    private readonly collectionId: string;
    private readonly cacheDir: string;
    private readonly client: WixDataClient;
    private manifestCache?: RouteManifest;
    private moduleCache = new Map<string, any>();
    private fetchPromises = new Map<string, Promise<string>>();

    constructor(options: WixDataArtifactStoreOptions) {
        this.collectionId = options.collectionId;
        this.cacheDir = options.cacheDir;
        this.client = createWixDataClient(options.apiKey, options.siteId);

        fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    async readManifest(): Promise<RouteManifest> {
        if (this.manifestCache) return this.manifestCache;

        const content = await this.ensureFile('route-manifest.json');
        this.manifestCache = JSON.parse(content);
        return this.manifestCache!;
    }

    async readPreRenderedHtml(relativePath: string): Promise<PreRenderedEntry> {
        const cachePath = relativePath.replace(/\.jay-html$/, '.cache.json');
        const cacheContent = await this.ensureFile(cachePath);

        try {
            const cacheData = JSON.parse(cacheContent);
            return {
                content: '',
                slowViewState: cacheData.slowViewState || {},
                carryForward: cacheData.carryForward || {},
            };
        } catch {
            return { content: '', slowViewState: {}, carryForward: {} };
        }
    }

    async loadServerElement(relativePath: string): Promise<ServerElementModule> {
        const cached = this.moduleCache.get(relativePath);
        if (cached) return cached;

        await this.ensureFile(relativePath);
        const fullPath = path.join(this.cacheDir, relativePath);
        const mod = await import(fullPath);
        this.moduleCache.set(relativePath, mod);
        return mod;
    }

    getAssetPath(relativePath: string): string {
        return path.join(this.cacheDir, relativePath);
    }

    getBuildDir(): string {
        return this.cacheDir;
    }

    /**
     * Load all eager files (manifests, shared server modules) from the data collection.
     * Call this once on cold start before creating the fetch handler.
     */
    async loadEagerFiles(): Promise<void> {
        console.log(`[WixDataArtifactStore] Loading eager files from collection "${this.collectionId}"...`);

        let totalLoaded = 0;
        let hasMore = true;
        let offset = 0;
        const limit = 50;

        while (hasMore) {
            const result = await this.client.items.query(this.collectionId)
                .eq('category', 'eager')
                .skip(offset)
                .limit(limit)
                .find();

            for (const item of result.items as DataCollectionItem[]) {
                this.writeToCache(item.path, item.content);
                totalLoaded++;
            }

            hasMore = result.items.length === limit;
            offset += limit;
        }

        console.log(`[WixDataArtifactStore] Loaded ${totalLoaded} eager files`);
    }

    /**
     * Ensure a file exists in the local cache. If not, fetch from data collection.
     * Deduplicates concurrent fetches for the same path.
     */
    private async ensureFile(relativePath: string): Promise<string> {
        const fullPath = path.join(this.cacheDir, relativePath);

        // Check disk cache first
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf8');
        }

        // Deduplicate concurrent fetches
        const existing = this.fetchPromises.get(relativePath);
        if (existing) return existing;

        const promise = this.fetchFromCollection(relativePath);
        this.fetchPromises.set(relativePath, promise);

        try {
            return await promise;
        } finally {
            this.fetchPromises.delete(relativePath);
        }
    }

    private async fetchFromCollection(relativePath: string): Promise<string> {
        console.log(`[WixDataArtifactStore] Fetching: ${relativePath}`);

        const id = relativePath.replace(/[/\\]/g, '__');

        try {
            const item = await this.client.items.get(this.collectionId, id) as DataCollectionItem | null;
            if (item?.content) {
                this.writeToCache(relativePath, item.content);
                return item.content;
            }
        } catch {
            // get by ID failed — try query by path
        }

        // Fallback: query by path field
        const result = await this.client.items.query(this.collectionId)
            .eq('path', relativePath)
            .limit(1)
            .find();

        if (result.items.length > 0) {
            const item = result.items[0] as DataCollectionItem;
            this.writeToCache(relativePath, item.content);
            return item.content;
        }

        throw new Error(`File not found in data collection: ${relativePath}`);
    }

    private writeToCache(relativePath: string, content: string): void {
        const fullPath = path.join(this.cacheDir, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
    }
}

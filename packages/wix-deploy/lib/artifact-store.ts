/**
 * WixDataArtifactStore — implements ArtifactStore for Wix BaaS deployments.
 *
 * Manages both reads (for serving) and writes (for upload/renderer) of
 * backend build artifacts in a Wix data collection. All items are versioned
 * so that a new version can be uploaded while the current version serves.
 *
 * Data collection schema:
 *   _id:       string  — "{version}__{path}" (unique key)
 *   version:   number  — build version
 *   path:      string  — relative file path within backend dir
 *   content:   string  — file content (text)
 *   fileType:  string  — extension (js, json)
 *   sizeBytes: number  — content byte length
 *   category:  string  — 'eager' | 'lazy'
 */

import type { WixClient } from '@wix/sdk';
import { items } from '@wix/data';
import fs from 'node:fs';
import path from 'node:path';

// ArtifactStore interface from @jay-framework/production-server (DL#143).
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

// ============================================================================
// Data collection item schema
// ============================================================================

export interface BackendFileItem {
    _id: string;
    version: number;
    path: string;
    content: string;
    fileType: string;
    sizeBytes: number;
    category: 'eager' | 'lazy';
}

export function makeItemId(version: number, relativePath: string): string {
    return `v${version}__${relativePath.replace(/[/\\]/g, '__')}`;
}

// ============================================================================
// Options
// ============================================================================

export interface WixDataArtifactStoreOptions {
    wixClient: WixClient;
    collectionId: string;
    cacheDir: string;
    version: number;
}

// ============================================================================
// Read + Write artifact store
// ============================================================================

export class WixDataArtifactStore implements ArtifactStore {
    readonly collectionId: string;
    readonly version: number;
    private readonly cacheDir: string;
    private readonly dataClient: ReturnType<WixClient['use']>;
    private manifestCache?: RouteManifest;
    private moduleCache = new Map<string, any>();
    private fetchPromises = new Map<string, Promise<string>>();

    constructor(options: WixDataArtifactStoreOptions) {
        this.collectionId = options.collectionId;
        this.version = options.version;
        this.cacheDir = options.cacheDir;
        this.dataClient = options.wixClient.use({ items });
        fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // ========================================================================
    // ArtifactStore interface (reads)
    // ========================================================================

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

    // ========================================================================
    // Eager loading (cold start)
    // ========================================================================

    async loadEagerFiles(): Promise<void> {
        console.log(`[WixDataArtifactStore] Loading eager files v${this.version} from "${this.collectionId}"...`);

        let totalLoaded = 0;
        let hasMore = true;
        let offset = 0;
        const limit = 50;

        while (hasMore) {
            const result = await this.dataClient.items.query(this.collectionId)
                .eq('category', 'eager')
                .eq('version', this.version)
                .skip(offset)
                .limit(limit)
                .find();

            for (const item of result.items as BackendFileItem[]) {
                this.writeToCache(item.path, item.content);
                totalLoaded++;
            }

            hasMore = result.items.length === limit;
            offset += limit;
        }

        console.log(`[WixDataArtifactStore] Loaded ${totalLoaded} eager files`);
    }

    // ========================================================================
    // Writes (for upload-backend and renderer)
    // ========================================================================

    /**
     * Write a single file to the data collection.
     */
    async writeFile(relativePath: string, content: string, category: 'eager' | 'lazy'): Promise<void> {
        const ext = path.extname(relativePath).slice(1);
        const item: BackendFileItem = {
            _id: makeItemId(this.version, relativePath),
            version: this.version,
            path: relativePath,
            content,
            fileType: ext || 'unknown',
            sizeBytes: Buffer.byteLength(content),
            category,
        };
        await this.dataClient.items.save(this.collectionId, item);
    }

    /**
     * Write a batch of files to the data collection.
     * Returns the number of successfully written files.
     */
    async writeFiles(files: Array<{ path: string; content: string; category: 'eager' | 'lazy' }>): Promise<number> {
        const dataItems: BackendFileItem[] = files.map(f => ({
            _id: makeItemId(this.version, f.path),
            version: this.version,
            path: f.path,
            content: f.content,
            fileType: path.extname(f.path).slice(1) || 'unknown',
            sizeBytes: Buffer.byteLength(f.content),
            category: f.category,
        }));

        try {
            await this.dataClient.items.bulkSave(this.collectionId, dataItems);
            return dataItems.length;
        } catch {
            // Fallback to individual saves
            let count = 0;
            for (const item of dataItems) {
                try {
                    await this.dataClient.items.save(this.collectionId, item);
                    count++;
                } catch { /* skip failed items */ }
            }
            return count;
        }
    }

    // ========================================================================
    // Internal: lazy file fetching
    // ========================================================================

    private async ensureFile(relativePath: string): Promise<string> {
        const fullPath = path.join(this.cacheDir, relativePath);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf8');
        }

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
        console.log(`[WixDataArtifactStore] Fetching: v${this.version}/${relativePath}`);

        const id = makeItemId(this.version, relativePath);
        try {
            const item = await this.dataClient.items.get(this.collectionId, id) as BackendFileItem | null;
            if (item?.content) {
                this.writeToCache(relativePath, item.content);
                return item.content;
            }
        } catch { /* get by ID failed — try query */ }

        const result = await this.dataClient.items.query(this.collectionId)
            .eq('path', relativePath)
            .eq('version', this.version)
            .limit(1)
            .find();

        if (result.items.length > 0) {
            const item = result.items[0] as BackendFileItem;
            this.writeToCache(relativePath, item.content);
            return item.content;
        }

        throw new Error(`File not found in data collection: v${this.version}/${relativePath}`);
    }

    private writeToCache(relativePath: string, content: string): void {
        const fullPath = path.join(this.cacheDir, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
    }
}

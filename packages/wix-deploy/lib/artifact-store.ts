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
import type {
    ArtifactStore,
    RouteManifest,
    CacheEntry,
    ServerElementModule,
} from '@jay-framework/production-server/serve';
import { items } from '@wix/data';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type { ArtifactStore, RouteManifest, CacheEntry, ServerElementModule };

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
    return crypto.createHash('sha256').update(`v${version}/${relativePath}`).digest('hex').slice(0, 32);
}

// ============================================================================
// Options
// ============================================================================

export interface WixDataArtifactStoreOptions {
    wixClient: WixClient;
    collectionId: string;
    cacheDir: string;
    version: number;
    moduleRegistry?: Record<string, any>;
}

// ============================================================================
// Read + Write artifact store
// ============================================================================

export class WixDataArtifactStore implements ArtifactStore {
    readonly collectionId: string;
    readonly version: number;
    private readonly cacheDir: string;
    private readonly dataClient: ReturnType<WixClient['use']>;
    private readonly moduleRegistry: Record<string, any>;
    private manifestCache?: RouteManifest;
    private moduleCache = new Map<string, any>();
    private fetchPromises = new Map<string, Promise<string>>();

    constructor(options: WixDataArtifactStoreOptions) {
        this.collectionId = options.collectionId;
        this.version = options.version;
        this.cacheDir = options.cacheDir;
        this.dataClient = options.wixClient.use({ items });
        this.moduleRegistry = options.moduleRegistry || {};
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

    async readCacheData(relativePath: string): Promise<CacheEntry> {
        const cacheContent = await this.ensureFile(relativePath);
        try {
            const cacheData = JSON.parse(cacheContent);
            return {
                slowViewState: cacheData.slowViewState || {},
                carryForward: cacheData.carryForward || {},
            };
        } catch {
            return { slowViewState: {}, carryForward: {} };
        }
    }

    async readPagePartsConfig(relativePath: string): Promise<any> {
        const content = await this.ensureFile(relativePath);
        return JSON.parse(content);
    }

    async loadServerElement(relativePath: string): Promise<ServerElementModule> {
        return this.loadModule(relativePath, true);
    }

    async loadModule(modulePath: string, _local?: boolean): Promise<any> {
        if (this.moduleRegistry[modulePath]) {
            return this.moduleRegistry[modulePath];
        }
        const cached = this.moduleCache.get(modulePath);
        if (cached) return cached;
        await this.ensureFile(modulePath);
        const fullPath = path.join(this.cacheDir, modulePath);
        const mod = await import(/* @vite-ignore */ fullPath);
        this.moduleCache.set(modulePath, mod);
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
        console.log(
            `[WixDataArtifactStore] Loading eager files v${this.version} from "${this.collectionId}"...`,
        );

        let totalLoaded = 0;
        let hasMore = true;
        let offset = 0;
        const limit = 50;

        while (hasMore) {
            const result = await this.dataClient.items
                .query(this.collectionId)
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
    async writeFile(
        relativePath: string,
        content: string,
        category: 'eager' | 'lazy',
    ): Promise<void> {
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
    async writeFiles(
        files: Array<{ path: string; content: string; category: 'eager' | 'lazy' }>,
    ): Promise<number> {
        const dataItems: BackendFileItem[] = files.map((f) => ({
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
                } catch {
                    /* skip failed items */
                }
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
        const id = makeItemId(this.version, relativePath);
        const t0 = Date.now();
        const item = (await this.dataClient.items.get(
            this.collectionId,
            id,
        )) as BackendFileItem | null;
        const t1 = Date.now();

        if (!item?.content) {
            throw new Error(`File not found in data collection: v${this.version}/${relativePath} (id: ${id})`);
        }

        this.writeToCache(relativePath, item.content);
        console.log(`[WixDataArtifactStore] Fetched v${this.version}/${relativePath} (${t1 - t0}ms)`);
        return item.content;
    }

    private writeToCache(relativePath: string, content: string): void {
        const fullPath = path.join(this.cacheDir, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });

        // Rewrite page-parts.json modulePath entries from absolute build paths
        // to package names that Node can resolve from the bundled entry.mjs
        if (relativePath.endsWith('page-parts.json')) {
            try {
                const config = JSON.parse(content);
                const rewriteParts = (parts: any[]) => {
                    for (const part of parts) {
                        if (part.modulePath && part.source === 'npm') {
                            // Extract package dir name from absolute path and map to npm name
                            // e.g. /Users/.../packages/wix-stores/dist/index.js → @jay-framework/wix-stores
                            // e.g. /Users/.../node_modules/@jay-framework/wix-stores/dist/index.js → @jay-framework/wix-stores
                            const npmMatch = part.modulePath.match(/\/@jay-framework\/([^/]+)\//);
                            if (npmMatch) {
                                part.modulePath = `@jay-framework/${npmMatch[1]}`;
                            } else {
                                const pkgMatch = part.modulePath.match(/\/packages\/(wix-[^/]+)\//);
                                if (pkgMatch) {
                                    part.modulePath = `@jay-framework/${pkgMatch[1]}`;
                                }
                            }
                        }
                    }
                };
                if (config.parts) rewriteParts(config.parts);
                if (config.instanceComponents) rewriteParts(config.instanceComponents);
                content = JSON.stringify(config);
            } catch {
                /* keep original content if parsing fails */
            }
        }

        fs.writeFileSync(fullPath, content, 'utf8');
    }
}

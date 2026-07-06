/**
 * WixDataArtifactStore — implements ArtifactStore for Wix BaaS deployments.
 *
 * Reads eager files (route-manifest.json, build-metadata.json) from the dist
 * directory alongside entry.mjs. Fetches lazy JSON files (page-parts, cache
 * data) from a Wix data collection on demand and caches them to disk.
 * All JS modules are resolved from the bundled MODULE_REGISTRY — no disk
 * loading of JS files.
 *
 * Also supports writes (for upload-backend) to the data collection.
 *
 * Data collection schema:
 *   _id:       string  — sha256("{version}/{path}") truncated to 32 chars
 *   version:   string  — deploy version (e.g. "0.0.1-d849685dc3de")
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
    version: string;
    path: string;
    content: string;
    fileType: string;
    sizeBytes: number;
    category: 'eager' | 'lazy';
}

export function makeItemId(version: string, relativePath: string): string {
    return crypto
        .createHash('sha256')
        .update(`v${version}/${relativePath}`)
        .digest('hex')
        .slice(0, 32);
}

// ============================================================================
// Options
// ============================================================================

export interface WixDataArtifactStoreOptions {
    wixClient: WixClient;
    collectionId: string;
    version: string;
    /** Directory containing entry.mjs and eager files (route-manifest.json, build-metadata.json). Required for reads. */
    distDir?: string;
    /** Directory for caching lazy files fetched from the data collection */
    cacheDir: string;
    moduleRegistry?: Record<string, any>;
}

// ============================================================================
// Read + Write artifact store
// ============================================================================

export class WixDataArtifactStore implements ArtifactStore {
    readonly collectionId: string;
    readonly version: string;
    private readonly distDir: string | undefined;
    private readonly cacheDir: string;
    private readonly dataClient: ReturnType<WixClient['use']>;
    private readonly moduleRegistry: Record<string, any>;
    private manifestCache?: RouteManifest;
    private fetchPromises = new Map<string, Promise<string>>();

    constructor(options: WixDataArtifactStoreOptions) {
        this.collectionId = options.collectionId;
        this.version = options.version;
        this.distDir = options.distDir;
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
        throw new Error(
            `Module not found in registry: ${modulePath}. All JS modules must be bundled in entry.mjs.`,
        );
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
    // Lazy page file loading
    // ========================================================================

    async ensurePageFiles(preRenderedPath: string): Promise<void> {
        const dir = path.dirname(preRenderedPath);
        const base = preRenderedPath.replace(/\.jay-html$/, '');

        const filesToEnsure = [
            path.join(dir, 'page-parts.json'),
            `${base}.cache.json`,
            `${base}.server-element.js`,
        ];

        await Promise.all(filesToEnsure.map((f) => this.ensureFile(f)));
    }

    // ========================================================================
    // Writes (for upload-backend and renderer)
    // ========================================================================

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
    // Internal: file resolution
    // ========================================================================

    private async ensureFile(relativePath: string): Promise<string> {
        // 1. Check dist dir (eager files bundled alongside entry.mjs)
        if (this.distDir) {
            const distPath = path.join(this.distDir, relativePath);
            if (fs.existsSync(distPath)) {
                return fs.readFileSync(distPath, 'utf8');
            }
        }

        // 2. Check cache dir (previously fetched lazy files)
        const cachePath = path.join(this.cacheDir, relativePath);
        if (fs.existsSync(cachePath)) {
            return fs.readFileSync(cachePath, 'utf8');
        }

        // 3. Fetch from data collection
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
        try {
            const item = (await this.dataClient.items.get(
                this.collectionId,
                id,
            )) as BackendFileItem | null;
            if (item?.content) {
                this.writeToCache(relativePath, item.content);
                return item.content;
            }
        } catch {
            /* get by ID failed — try query */
        }

        const result = await this.dataClient.items
            .query(this.collectionId)
            .eq('path', relativePath)
            .eq('version', this.version)
            .limit(1)
            .find();

        if (result.items.length > 0) {
            const item = result.items[0] as BackendFileItem;
            this.writeToCache(relativePath, item.content);
            return item.content;
        }

        throw new Error(
            `File not found in data collection: v${this.version}/${relativePath} (id: ${id})`,
        );
    }

    private writeToCache(relativePath: string, content: string): void {
        const fullPath = path.join(this.cacheDir, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });

        if (relativePath.endsWith('page-parts.json')) {
            try {
                const config = JSON.parse(content);
                const rewriteParts = (parts: any[]) => {
                    for (const part of parts) {
                        if (part.modulePath && part.source === 'npm') {
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

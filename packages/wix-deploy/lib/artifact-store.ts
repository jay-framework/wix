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
 *   category:  string  — 'eager' | 'lazy' | 'instance'
 *   route:     string  — (instance items) route pattern, e.g. "/products/[slug]"
 *   params:    object  — (instance items) route params of the instance
 *
 * Instances (Jay Design Log #227): each `*.cache.json` is its own DB item with
 * `category: 'instance'`, `route` and `params`. The item *is* the instance index entry —
 * creating an instance is one insert at the derived `_id`, deleting one is one remove.
 * There is no shared manifest blob to lock or rewrite.
 */

import type { WixClient } from '@wix/sdk';
import type {
    ArtifactStore,
    ListInstancesOptions,
    RouteManifest,
    RouteEntry,
    InstanceEntry,
    InstanceRef,
    CacheEntry,
    ServerElementModule,
} from '@jay-framework/production-server/serve';
import {
    CacheNotFoundError,
    SwrCache,
    DEFAULT_LIST_TTL_MS,
    deriveCachePath,
    parseCacheEntry,
    serializeCacheEntry,
    synthesizeInstance,
} from '@jay-framework/production-server/serve';
import { items } from '@wix/data';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type { ArtifactStore, RouteManifest, CacheEntry, ServerElementModule };
export { CacheNotFoundError };

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
    category: 'eager' | 'lazy' | 'instance';
    /** Instance items: the route pattern this instance belongs to. */
    route?: string;
    /** Instance items: the route params identifying the instance. */
    params?: Record<string, string>;
}

/** Items per page when enumerating instances. */
const LIST_PAGE_SIZE = 100;
/** Minimum time between DB revalidations of one locally cached, TTL-expired instance. */
const REVALIDATE_MIN_INTERVAL_MS = 5_000;

function errorCode(err: any): string | undefined {
    return err?.details?.applicationError?.code ?? err?.code;
}

/** Wix Data "item not found" (WDE0073). */
function isNotFound(err: any): boolean {
    return errorCode(err) === 'WDE0073' || /not found|does not exist/i.test(String(err?.message));
}

/** Wix Data "item already exists" (WDE0074). */
function isDuplicateId(err: any): boolean {
    return errorCode(err) === 'WDE0074' || /already exists/i.test(String(err?.message));
}

function renderedAtOf(content: string): number {
    try {
        const renderedAt = JSON.parse(content).renderedAt;
        return typeof renderedAt === 'number' ? renderedAt : 0;
    } catch {
        return 0;
    }
}

/** True when a stored cache file carries a ttl that has elapsed (Jay Design Log #226). */
function isTtlExpired(content: string, now: number): boolean {
    try {
        const { renderedAt, ttl } = JSON.parse(content);
        return typeof renderedAt === 'number' && typeof ttl === 'number'
            ? now - renderedAt >= ttl * 1000
            : false;
    } catch {
        return false;
    }
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
    /** Lifetime of cached instance listings (default 10 min). */
    listTtlMs?: number;
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
    private readonly listCache: SwrCache<InstanceRef[]>;
    private readonly lastRevalidated = new Map<string, number>();

    constructor(options: WixDataArtifactStoreOptions) {
        this.collectionId = options.collectionId;
        this.version = options.version;
        this.distDir = options.distDir;
        this.cacheDir = options.cacheDir;
        this.dataClient = options.wixClient.use({ items });
        this.moduleRegistry = options.moduleRegistry || {};
        this.listCache = new SwrCache<InstanceRef[]>(options.listTtlMs ?? DEFAULT_LIST_TTL_MS);
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
        const cacheContent = await this.readInstanceFile(relativePath);
        try {
            return parseCacheEntry(cacheContent);
        } catch {
            return { slowViewState: {}, carryForward: {} };
        }
    }

    /** Re-read an instance from the collection, bypassing the local copy (another server may have refreshed it). */
    async readCacheDataFresh(relativePath: string): Promise<CacheEntry> {
        return parseCacheEntry(await this.fetchShared(relativePath));
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
    // Instances (Design Log #227)
    // ========================================================================

    async getInstance(
        route: RouteEntry,
        params: Record<string, string>,
    ): Promise<InstanceEntry | undefined> {
        const cachePath = deriveCachePath(route.pattern, params);
        if (this.hasLocalFile(cachePath)) return synthesizeInstance(route, params);
        try {
            await this.ensureFile(cachePath);
        } catch (err) {
            if (err instanceof CacheNotFoundError) return undefined;
            throw err;
        }
        return synthesizeInstance(route, params);
    }

    async *listInstances(
        route: RouteEntry,
        options?: ListInstancesOptions,
    ): AsyncIterable<InstanceRef> {
        const refs = await this.listCache.get(
            route.pattern,
            () => this.queryInstances(route),
            options?.fresh === true,
        );
        for (const ref of refs) yield ref;
    }

    /**
     * Upsert an instance: one `insert` at the derived `_id`. On a duplicate id (another server
     * created it, or this is a refresh) the existing item is adopted when it is at least as new,
     * otherwise overwritten with `save`. No lock, no retry loop.
     */
    async writeCacheData(
        route: RouteEntry,
        params: Record<string, string>,
        entry: CacheEntry,
    ): Promise<void> {
        const cachePath = deriveCachePath(route.pattern, params);
        const content = serializeCacheEntry(route, params, entry);
        const item: BackendFileItem = {
            _id: makeItemId(this.version, cachePath),
            version: this.version,
            path: cachePath,
            content,
            fileType: 'json',
            sizeBytes: Buffer.byteLength(content),
            category: 'instance',
            route: route.pattern,
            params,
        };

        let stored = content;
        try {
            await this.dataClient.items.insert(this.collectionId, item);
        } catch (err) {
            if (!isDuplicateId(err)) throw err;
            const existing = (await this.dataClient.items.get(
                this.collectionId,
                item._id,
            )) as BackendFileItem | null;
            if (existing?.content && renderedAtOf(existing.content) >= (entry.renderedAt ?? 0)) {
                stored = existing.content; // adopt the winner
            } else {
                await this.dataClient.items.save(this.collectionId, item);
            }
        }

        this.writeToCache(cachePath, stored);
        this.listCache.invalidate(route.pattern);
    }

    async removeInstance(route: RouteEntry, params: Record<string, string>): Promise<void> {
        const cachePath = deriveCachePath(route.pattern, params);
        try {
            await this.dataClient.items.remove(
                this.collectionId,
                makeItemId(this.version, cachePath),
            );
        } catch (err) {
            if (!isNotFound(err)) throw err;
        }
        fs.rmSync(path.join(this.cacheDir, cachePath), { force: true });
        this.listCache.invalidate(route.pattern);
    }

    private async queryInstances(route: RouteEntry): Promise<InstanceRef[]> {
        const refs: InstanceRef[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
            const result = await this.dataClient.items
                .query(this.collectionId)
                .eq('category', 'instance')
                .eq('version', this.version)
                .eq('route', route.pattern)
                .skip(offset)
                .limit(LIST_PAGE_SIZE)
                .find();
            for (const item of result.items as BackendFileItem[]) {
                const params =
                    typeof item.params === 'string' ? JSON.parse(item.params) : item.params;
                if (params) refs.push({ params, cachePath: item.path });
            }
            hasMore = result.items.length === LIST_PAGE_SIZE;
            offset += LIST_PAGE_SIZE;
        }
        return refs;
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
        category: 'eager' | 'lazy' | 'instance',
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
        files: Array<{
            path: string;
            content: string;
            category: 'eager' | 'lazy' | 'instance';
            route?: string;
            params?: Record<string, string>;
        }>,
    ): Promise<number> {
        const dataItems: BackendFileItem[] = files.map((f) => ({
            _id: makeItemId(this.version, f.path),
            version: this.version,
            path: f.path,
            content: f.content,
            fileType: path.extname(f.path).slice(1) || 'unknown',
            sizeBytes: Buffer.byteLength(f.content),
            category: f.category,
            ...(f.route !== undefined && { route: f.route }),
            ...(f.params !== undefined && { params: f.params }),
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
        return this.fetchShared(relativePath);
    }

    private hasLocalFile(relativePath: string): boolean {
        return (
            (this.distDir !== undefined && fs.existsSync(path.join(this.distDir, relativePath))) ||
            fs.existsSync(path.join(this.cacheDir, relativePath))
        );
    }

    /**
     * Read a file; for instance cache files whose ttl has elapsed, re-check the collection
     * (at most every few seconds per file) so a refresh done by another server is picked up.
     */
    private async readInstanceFile(relativePath: string): Promise<string> {
        const local = await this.ensureFile(relativePath);
        if (!relativePath.endsWith('.cache.json')) return local;

        const now = Date.now();
        if (!isTtlExpired(local, now)) return local;
        const last = this.lastRevalidated.get(relativePath) ?? 0;
        if (now - last < REVALIDATE_MIN_INTERVAL_MS) return local;
        this.lastRevalidated.set(relativePath, now);
        try {
            return await this.fetchShared(relativePath);
        } catch {
            return local;
        }
    }

    private async fetchShared(relativePath: string): Promise<string> {
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
        // Instance items have a deterministic id: a single `get` answers, and only a real
        // "not found" means the instance does not exist (other errors are not a 404).
        const isInstance = relativePath.endsWith('.cache.json');
        try {
            const item = (await this.dataClient.items.get(
                this.collectionId,
                id,
            )) as BackendFileItem | null;
            if (item?.content) {
                this.writeToCache(relativePath, item.content);
                return item.content;
            }
        } catch (err) {
            if (isInstance && !isNotFound(err)) throw err;
            /* otherwise: get by ID failed — try query */
        }

        if (!isInstance) {
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
        }

        throw new CacheNotFoundError(relativePath);
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

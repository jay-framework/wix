interface RouteSegment {
    type: 'static' | 'param' | 'optional' | 'catchAll' | 'optionalCatchAll';
    value: string;
}

interface RouteInstance {
    params: Record<string, string>;
}

interface RouteEntry {
    pattern: string;
    segments: RouteSegment[];
    instances: RouteInstance[];
    noIndex?: boolean;
    devOnly?: boolean;
}

interface RouteManifest {
    routes: RouteEntry[];
}

export interface WixPageManifestEntry {
    path: string;
    static: true;
}

/**
 * Convert Jay's built route instances to the page registry consumed by Wix
 * Site Structure at /_wix/pages.json.
 */
export function createWixPagesManifest(manifest: RouteManifest): WixPageManifestEntry[] {
    const paths = new Set<string>();

    for (const route of manifest.routes) {
        if (route.devOnly || route.noIndex) continue;

        if (route.instances.length === 0) {
            const hasDynamicSegments = route.segments.some((segment) => segment.type !== 'static');
            if (!hasDynamicSegments) paths.add(normalizePath(route.pattern));
            continue;
        }

        for (const instance of route.instances) {
            paths.add(buildPath(route.pattern, instance.params));
        }
    }

    return [...paths].map((path) => ({ path, static: true }));
}

function buildPath(pattern: string, params: Record<string, string>): string {
    return normalizePath(
        pattern
            .replace(/\[\[\.\.\.(\w+)\]\]/g, (_, name) => params[name] || '')
            .replace(/\[\[(\w+)\]\]/g, (_, name) => params[name] || '')
            .replace(/\[\.\.\.(\w+)\]/g, (_, name) => params[name] || '')
            .replace(/\[(\w+)\]/g, (_, name) => params[name] || ''),
    );
}

function normalizePath(path: string): string {
    return path.replace(/\/\/+/g, '/').replace(/\/$/, '') || '/';
}

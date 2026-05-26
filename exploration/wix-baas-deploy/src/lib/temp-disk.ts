import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CACHE_DIR = path.join(os.tmpdir(), 'jay-baas-test');

export function handleTempDisk(url: URL): Response {
    const action = url.searchParams.get('action') || 'info';

    try {
        if (action === 'write') {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            const testFile = path.join(CACHE_DIR, 'test-page.json');
            const data = {
                content: '<h1>Cached Page</h1>',
                cachedAt: new Date().toISOString(),
                randomId: Math.random().toString(36).slice(2),
            };
            fs.writeFileSync(testFile, JSON.stringify(data));
            return json({
                action: 'write',
                path: testFile,
                size: fs.statSync(testFile).size,
                data,
            });
        }

        if (action === 'read') {
            const testFile = path.join(CACHE_DIR, 'test-page.json');
            if (!fs.existsSync(testFile)) {
                return json({ action: 'read', error: 'Not found — call ?action=write first' }, 404);
            }
            return json({ action: 'read', data: JSON.parse(fs.readFileSync(testFile, 'utf8')) });
        }

        if (action === 'list') {
            const files = fs.existsSync(CACHE_DIR)
                ? fs.readdirSync(CACHE_DIR).map(f => ({
                      name: f,
                      size: fs.statSync(path.join(CACHE_DIR, f)).size,
                  }))
                : [];
            return json({ action: 'list', cacheDir: CACHE_DIR, files });
        }

        return json({
            action: 'info',
            tmpdir: os.tmpdir(),
            cacheDir: CACHE_DIR,
            cacheDirExists: fs.existsSync(CACHE_DIR),
            platform: os.platform(),
            totalMemory: `${(os.totalmem() / 1024 / 1024).toFixed(0)} MB`,
            freeMemory: `${(os.freemem() / 1024 / 1024).toFixed(0)} MB`,
        });
    } catch (err: any) {
        return json({ error: err.message }, 500);
    }
}

function json(data: any, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

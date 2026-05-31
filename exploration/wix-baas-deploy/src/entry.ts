/**
 * BaaS entry point — exports a default fetch handler.
 * Tests: static response, multi-file import, temp disk access, env discovery.
 */
import { renderPage } from './lib/page-renderer.js';
import { handleTempDisk } from './lib/temp-disk.js';
import { getEnvInfo } from './lib/env-info.js';

async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Test 1: Simple JSON response
    if (path === '/hello' || path === '/') {
        return jsonResponse({
            message: 'Hello from Jay on Wix BaaS!',
            timestamp: new Date().toISOString(),
        });
    }

    // Test 2: Multi-file import — renders HTML from a separate module
    if (path === '/page') {
        const name = url.searchParams.get('name') || 'World';
        const html = renderPage(
            'Test Page',
            `<h1>Hello, ${name}!</h1><p>Rendered by a separate module.</p>`,
        );
        return new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    // Test 3: Temp disk — write/read/list files on in-memory disk
    if (path === '/disk') {
        return handleTempDisk(url);
    }

    // Test 4: Environment info
    if (path === '/env') {
        return jsonResponse(await getEnvInfo());
    }

    return jsonResponse(
        { error: 'Not found', routes: ['/', '/hello', '/page', '/disk', '/env'] },
        404,
    );
}

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export default { fetch: handler };
export { handler as fetch };

import fs from 'node:fs';
import path from 'node:path';

export async function getEnvInfo() {
    const checks: Record<string, any> = {};

    checks.moduleSystem = {
        type: 'ESM',
        importMetaUrl: import.meta.url,
    };

    checks.process = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        cwd: process.cwd(),
    };

    // Safe env vars only
    const safeEnvKeys = Object.keys(process.env).filter(
        k => !k.includes('KEY') && !k.includes('SECRET') && !k.includes('TOKEN') && !k.includes('PASSWORD'),
    );
    checks.envVarCount = Object.keys(process.env).length;
    checks.safeEnvVars = Object.fromEntries(
        safeEnvKeys.slice(0, 30).map(k => [k, process.env[k]?.substring(0, 100)]),
    );

    // CWD contents
    try {
        checks.cwdFiles = fs.readdirSync(process.cwd()).slice(0, 50);
    } catch (e: any) {
        checks.cwdFiles = `Error: ${e.message}`;
    }

    // Deployed files (relative to this module)
    try {
        const dirname = path.dirname(new URL(import.meta.url).pathname);
        checks.deployedFiles = {
            dir: dirname,
            files: fs.readdirSync(dirname).slice(0, 50),
        };
        // Also check parent
        const parentDir = path.dirname(dirname);
        checks.parentFiles = {
            dir: parentDir,
            files: fs.readdirSync(parentDir).slice(0, 50),
        };
    } catch (e: any) {
        checks.deployedFiles = `Error: ${e.message}`;
    }

    // /tmp access
    try {
        const tmpFiles = fs.readdirSync('/tmp');
        checks.tmpDir = { readable: true, fileCount: tmpFiles.length, sampleFiles: tmpFiles.slice(0, 20) };
    } catch (e: any) {
        checks.tmpDir = { readable: false, error: e.message };
    }

    // Available Web APIs
    checks.globals = {
        hasResponse: typeof Response !== 'undefined',
        hasRequest: typeof Request !== 'undefined',
        hasFetch: typeof fetch !== 'undefined',
        hasReadableStream: typeof ReadableStream !== 'undefined',
        hasTextEncoder: typeof TextEncoder !== 'undefined',
    };

    return checks;
}

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WixConfigFile {
    appId: string;
    siteId: string;
}

/** Reads the Wix CLI project file `wix.config.json` (no secrets). Null when missing or unparsable. */
export function readWixConfig(projectRoot: string): WixConfigFile | null {
    const wixConfigPath = path.join(projectRoot, 'wix.config.json');
    if (!fs.existsSync(wixConfigPath)) return null;

    try {
        const config = JSON.parse(fs.readFileSync(wixConfigPath, 'utf-8'));
        return { appId: config.appId || '', siteId: config.siteId || '' };
    } catch {
        return null;
    }
}

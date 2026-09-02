/**
 * jay-stack run wix-deploy/sync-txt-files
 *
 * Syncs the project's public/robots.txt, public/ads.txt, and public/llms.txt
 * to Wix's TXT File Server. Wix Headless intercepts these paths and serves its
 * own versions, so the only way a project's custom content reaches visitors is
 * via these APIs.
 *
 * Override-only: files missing from public/ are left as Wix's default.
 */

import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import type { ConsoleContext } from '@jay-framework/fullstack-component';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import type { WixClientService } from '@jay-framework/wix-server-client';

interface SyncTxtFilesInput {
    subdomain?: string;
}

interface TxtFile {
    /** Filename in the project's public/ directory. */
    fileName: string;
    /** TXT File Server endpoint. */
    url: string;
    /** Request body key (robotsTxt | adsTxt | llmsTxt). */
    bodyKey: string;
}

const TXT_FILES: TxtFile[] = [
    {
        fileName: 'robots.txt',
        url: 'https://www.wixapis.com/promote-seo-txt-file-server/v2/robots',
        bodyKey: 'robotsTxt',
    },
    {
        fileName: 'ads.txt',
        url: 'https://www.wixapis.com/promote-seo-txt-file-server/v2/ads',
        bodyKey: 'adsTxt',
    },
    {
        fileName: 'llms.txt',
        url: 'https://www.wixapis.com/promote-seo-txt-file-server/v2/llms',
        bodyKey: 'llmsTxt',
    },
];

export interface SyncTxtFilesResult {
    success: boolean;
    synced: string[];
    skipped: string[];
    errors: string[];
}

export const syncTxtFiles = makeCliCommand('sync-txt-files')
    .withServices(WIX_CLIENT_SERVICE, CONSOLE_CONTEXT)
    .withHandler(
        async (
            input: SyncTxtFilesInput,
            wixClientService: WixClientService,
            ctx: ConsoleContext,
        ): Promise<SyncTxtFilesResult> => {
            const fs = await import('node:fs');
            const path = await import('node:path');

            const subdomain = input.subdomain || 'www';
            const publicDir = path.join(ctx.projectRoot, 'public');

            const synced: string[] = [];
            const skipped: string[] = [];
            const errors: string[] = [];

            for (const file of TXT_FILES) {
                const filePath = path.join(publicDir, file.fileName);
                if (!fs.existsSync(filePath)) {
                    skipped.push(file.fileName);
                    continue;
                }

                const content = fs.readFileSync(filePath, 'utf8');
                const body = { [file.bodyKey]: { content, default: false, subdomain } };

                try {
                    const response = await wixClientService.wixClient.fetchWithAuth(file.url, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });
                    if (!response.ok) {
                        const text = await response.text();
                        errors.push(`${file.fileName}: HTTP ${response.status} ${text}`);
                        continue;
                    }
                    synced.push(file.fileName);
                } catch (err) {
                    errors.push(`${file.fileName}: ${err instanceof Error ? err.message : err}`);
                }
            }

            const parts: string[] = [];
            if (synced.length) parts.push(`Synced ${synced.join(', ')}`);
            if (skipped.length) parts.push(`skipped ${skipped.join(', ')} (not in public/)`);
            ctx.log(parts.join('; ') || 'No txt files to sync');
            for (const error of errors) ctx.warn(error);

            return { success: errors.length === 0, synced, skipped, errors };
        },
    );

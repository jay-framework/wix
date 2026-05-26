import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import { WIX_MEDIA_SERVICE_MARKER } from '../services/wix-media-service.js';
import { generateMediaIndex } from '../index-generator.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const rebuildIndex = makeCliCommand('rebuild-index')
    .withServices(WIX_MEDIA_SERVICE_MARKER, CONSOLE_CONTEXT)
    .withHandler(async (input: {}, mediaService, console) => {
        console.log('Fetching media from Wix Media Manager...');
        const files = await mediaService.listPublicFiles();
        console.log(`Found ${files.length} public media files.`);

        const referencesDir = path.join(
            console.projectRoot,
            'agent-kit',
            'references',
            'wix-media',
        );
        fs.mkdirSync(referencesDir, { recursive: true });

        const indexContent = generateMediaIndex(files);
        const indexPath = path.join(referencesDir, 'MEDIA-INDEX.md');
        fs.writeFileSync(indexPath, indexContent, 'utf-8');

        console.log(`Media index written to ${indexPath}`);
        return { success: true };
    });

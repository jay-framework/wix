import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER, NoCallerSessionError } from '@jay-framework/wix-data';
import { isPermissionDenied, resolveRequestIdentity } from '@jay-framework/wix-server-client';
import type { MyNotesContract } from './page.jay-contract';

/** The page reads per-caller data, so it must never be shared-cached (DL#43 V4). */
const PER_CALLER_HEADERS = { responseHeaders: { 'Cache-Control': 'private' } };

/** Lists the signed-in member's own ProbeNotes, read as the caller (DL#43 demo). */
export const page = makeJayStackComponent<MyNotesContract>()
    .withProps()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .withFastRender(async (props, wixData) => {
        try {
            const notes = await wixData.forCaller(resolveRequestIdentity(props.cookies)).query('ProbeNotes').find();
            return phaseOutput({ signedIn: true, noteCount: notes.items.length, status: 'ok' }, {}, PER_CALLER_HEADERS);
        } catch (error) {
            if (error instanceof NoCallerSessionError || isPermissionDenied(error)) {
                return phaseOutput({ signedIn: false, noteCount: 0, status: 'signed-out' }, {}, PER_CALLER_HEADERS);
            }
            throw error;
        }
    });

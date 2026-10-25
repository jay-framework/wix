import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { FieldValue } from '../types.js';

/**
 * POST a form submission to the Wix `/forms/v4/submissions` API.
 *
 * `submissions` is a JSON map keyed by field target. DL#39 4c widened the value type
 * to `FieldValue` so a checkbox submits its boolean `.checked` and a multiselect its
 * full `string[]`, not a truncated string.
 *
 * ⚠️ DL#39 MUST-VERIFY #1 (live, VPN + authenticated POST — not unit-testable here):
 * confirm the API accepts a boolean / string-array value for those field kinds. If it
 * requires a specific wire encoding, serialize per field kind at THIS single boundary
 * (the correctness guarantee is unchanged — only the encoding point moves).
 */
export async function createFormSubmission(
    client: WixClient,
    formId: string,
    submissions: Record<string, FieldValue>,
): Promise<void> {
    await wixFetch(client, '/forms/v4/submissions', {
        method: 'POST',
        body: {
            submission: {
                formId,
                submissions,
            },
        },
    });
}

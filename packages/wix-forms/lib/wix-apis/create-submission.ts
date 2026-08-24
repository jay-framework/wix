import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export async function createFormSubmission(
    client: WixClient,
    formId: string,
    submissions: Record<string, string>,
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

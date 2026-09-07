import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

/** Namespace for forms created in the Wix Forms app (Wix REST API). */
export const WIX_FORMS_NAMESPACE = 'wix.form_app.form';

export interface ListedFormSchema {
    formId: string;
    title: string;
}

interface ListFormsResponse {
    forms?: Array<{
        id?: string;
        name?: string;
        properties?: { name?: string };
    }>;
    pagingMetadata?: {
        cursors?: { next?: string };
        hasNext?: boolean;
    };
}

function readFormTitle(form: NonNullable<ListFormsResponse['forms']>[number]): string {
    return form.properties?.name?.trim() || form.name?.trim() || 'Form';
}

function readFormId(form: NonNullable<ListFormsResponse['forms']>[number]): string | undefined {
    return form.id?.trim() || undefined;
}

/**
 * List all Wix Forms schemas on the connected site (namespace wix.form_app.form).
 * Paginates until all forms are retrieved.
 */
export async function listSiteFormSchemas(client: WixClient): Promise<ListedFormSchema[]> {
    const results: ListedFormSchema[] = [];
    let cursor: string | undefined;

    do {
        const query = new URLSearchParams({ namespace: WIX_FORMS_NAMESPACE });
        if (cursor) {
            query.set('paging.cursor', cursor);
        }
        query.set('paging.limit', '100');

        const response = await wixFetch<ListFormsResponse>(
            client,
            `/form-schema-service/v4/forms?${query.toString()}`,
            { method: 'GET' },
        );

        for (const form of response.forms ?? []) {
            const formId = readFormId(form);
            if (!formId) {
                continue;
            }
            results.push({ formId, title: readFormTitle(form) });
        }

        cursor = response.pagingMetadata?.hasNext
            ? response.pagingMetadata.cursors?.next
            : undefined;
    } while (cursor);

    return results;
}

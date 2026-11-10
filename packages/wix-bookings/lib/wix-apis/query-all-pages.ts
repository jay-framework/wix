import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client/client';

const PAGE_LIMIT = 100;

type CursorPage<K extends string, T> = { [key in K]?: T[] } & {
    pagingMetadata?: { cursors?: { next?: string } };
};

/** Reads every page of a cursor-paged Wix query endpoint. */
export async function queryAllPages<K extends string, T>(
    client: WixClient,
    url: string,
    itemsKey: K,
): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | undefined;
    do {
        const page = await wixFetch<CursorPage<K, T>>(client, url, {
            method: 'POST',
            body: { query: { cursorPaging: { limit: PAGE_LIMIT, ...(cursor && { cursor }) } } },
        });
        items.push(...(page[itemsKey] ?? []));
        cursor = page.pagingMetadata?.cursors?.next || undefined;
    } while (cursor);
    return items;
}

/**
 * Paginate the V3 categories API to collect slugs for setup / config validation.
 */

import type { WixClient } from '@wix/sdk';
import { queryCategories } from './wix-apis/index.js';

export async function fetchCategorySlugs(wixClient: WixClient): Promise<Set<string>> {
    const slugs = new Set<string>();
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
        const result = await queryCategories(
            wixClient,
            cursor
                ? { cursorPaging: { cursor } }
                : { filter: { visible: true }, cursorPaging: { limit: 100 } },
        );
        for (const category of result.categories ?? []) {
            if (category.slug) {
                slugs.add(category.slug);
            }
        }
        cursor = result.pagingMetadata?.cursors?.next;
        hasMore = Boolean(cursor);
    }

    return slugs;
}

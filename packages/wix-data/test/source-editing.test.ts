import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    SHARED_EDITING_GUIDE_PATH,
    sourceEditingContractHeader,
    type DynamicContractPrefix,
} from '../lib/source-editing.ts';

describe('wix-data source-editing contract header (DL#39)', () => {
    it('uses the shared CMS guide for every contract prefix', () => {
        const prefixes: DynamicContractPrefix[] = ['item', 'list', 'table', 'card'];
        for (const prefix of prefixes) {
            const header = sourceEditingContractHeader('Articles', prefix);
            assert.equal(
                header,
                `collectionId: Articles\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
            );
        }
    });

    it('quotes collection ids that need YAML escaping', () => {
        assert.equal(
            sourceEditingContractHeader('Bookings/Services', 'list'),
            `collectionId: "Bookings/Services"\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });
});

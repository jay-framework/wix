import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SHARED_EDITING_GUIDE_PATH, sourceEditingContractHeader } from '../lib/source-editing.ts';

describe('wix-data source-editing contract header (DL#39)', () => {
    it('emits collectionId and the shared CMS editingGuide path', () => {
        assert.equal(
            sourceEditingContractHeader('Articles'),
            `collectionId: Articles\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });

    it('quotes collection ids that need YAML escaping', () => {
        assert.equal(
            sourceEditingContractHeader('Bookings/Services'),
            `collectionId: "Bookings/Services"\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });
});

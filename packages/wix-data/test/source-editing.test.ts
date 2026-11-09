// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { SHARED_EDITING_GUIDE_PATH, sourceEditingContractHeader } from '../lib/source-editing';

describe('wix-data source-editing contract header (DL#39)', () => {
    it('emits collectionId and the shared CMS editingGuide path', () => {
        expect(sourceEditingContractHeader('Articles')).toEqual(
            `collectionId: Articles\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });

    it('quotes collection ids that need YAML escaping', () => {
        expect(sourceEditingContractHeader('Bookings/Services')).toEqual(
            `collectionId: "Bookings/Services"\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });
});

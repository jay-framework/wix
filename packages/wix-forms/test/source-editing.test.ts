import { describe, expect, it } from 'vitest';

import { SHARED_EDITING_GUIDE_PATH, sourceEditingContractHeader } from '../lib/source-editing.js';

describe('wix-forms source-editing contract header (DL#39)', () => {
    it('emits formId and the shared forms editingGuide path', () => {
        expect(sourceEditingContractHeader('f1a2b3')).toEqual(
            `formId: f1a2b3\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });

    it('quotes form ids that need YAML escaping', () => {
        expect(sourceEditingContractHeader('form:id/with/slashes')).toEqual(
            `formId: "form:id/with/slashes"\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });
});

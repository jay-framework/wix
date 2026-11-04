import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    generatorContractName,
    materializedContractName,
    SHARED_EDITING_GUIDE_PATH,
    sourceEditingContractHeader,
    toKebabCase,
} from '../lib/source-editing.ts';

describe('wix-data source-editing (DL#39)', () => {
    it('kebab-cases generator names like Jay materializer', () => {
        assert.equal(toKebabCase('RecipesList'), 'recipes-list');
        assert.equal(toKebabCase('ArticlesItem'), 'articles-item');
    });

    it('builds materialized contract names', () => {
        assert.equal(materializedContractName('list', 'Recipes'), 'list/recipes-list');
        assert.equal(generatorContractName('item', 'Articles'), 'ArticlesItem');
    });

    it('points every materialized contract at the shared CMS guide', () => {
        const header = sourceEditingContractHeader('Recipes', 'list');
        assert.match(header, /collectionId: Recipes/);
        assert.match(header, new RegExp(`editingGuide: ${SHARED_EDITING_GUIDE_PATH.replace(/\//g, '\\/')}`));
    });

    it('quotes collection ids that contain slashes', () => {
        const header = sourceEditingContractHeader('Bookings/Services', 'list');
        assert.match(header, /collectionId: "Bookings\/Services"/);
        assert.match(header, /editingGuide: agent-kit\/references\/wix-data\/wix-data-dashboard-content\.md/);
    });
});

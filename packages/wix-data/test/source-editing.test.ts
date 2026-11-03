import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    editingGuideProjectPath,
    generatorContractName,
    materializedContractName,
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

    it('aligns editingGuide path with materialized file naming', () => {
        assert.equal(
            editingGuideProjectPath('list', 'Recipes'),
            'agent-kit/references/wix-data/editing-guides/list-recipes-list.md',
        );
    });

    it('quotes collection ids that contain slashes', () => {
        const header = sourceEditingContractHeader('Bookings/Services', 'list');
        assert.match(header, /collectionId: "Bookings\/Services"/);
        assert.match(header, /editingGuide: agent-kit\/references\/wix-data\/editing-guides\//);
    });
});

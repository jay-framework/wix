// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { mapChoice, selectedChoices } from '../lib/utils/product-options.js';

describe('mapChoice', () => {
    it('names a color choice by its description and keeps its value as the color code', () => {
        expect(mapChoice('color', { value: '#6887f1', description: 'purple' })).toEqual({
            choiceId: 'purple',
            name: 'purple',
            colorCode: '#6887f1',
        });
    });

    it('uses the value of a text choice (or one without a description) as its name', () => {
        expect(mapChoice('drop_down', { value: 'Large', description: 'Large' })).toEqual({
            choiceId: 'Large',
            name: 'Large',
            colorCode: '',
        });
        expect(mapChoice('drop_down', { value: 'Small' }).choiceId).toBe('Small');
    });
});

describe('selectedChoices', () => {
    it('maps each option with a selection to its chosen choice', () => {
        expect(
            selectedChoices([
                {
                    _id: 'Color',
                    choices: [
                        { choiceId: 'purple', isSelected: false },
                        { choiceId: 'Orange', isSelected: true },
                    ],
                },
                { _id: 'Size', textChoiceSelection: 'Large', choices: [] },
                { _id: 'Fit', choices: [{ choiceId: 'Slim', isSelected: false }] },
            ]),
        ).toEqual({ Color: 'Orange', Size: 'Large' });
    });
});

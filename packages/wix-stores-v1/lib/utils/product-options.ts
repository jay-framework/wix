/**
 * Catalog V1 product option choices.
 *
 * A V1 choice has a `value` and a `description`. For a text option both are the choice's name; for a color
 * option `value` is the color code ("#6887f1") and `description` is the name ("purple"). Variants
 * (`variant.choices`) and cart line items (`catalogReference.options.options`) refer to a choice by its
 * description, so that is the choice's id.
 */

export interface V1Choice {
    value?: string | null;
    description?: string | null;
}

export interface ChoiceFields {
    choiceId: string;
    name: string;
    colorCode: string;
}

/** The id, display name and color code of a V1 choice. */
export function mapChoice(optionType: string | null | undefined, choice: V1Choice): ChoiceFields {
    const name = choice.description || choice.value || '';
    return {
        choiceId: name,
        name,
        colorCode: optionType === 'color' ? choice.value || '' : '',
    };
}

export interface OptionSelection {
    _id: string;
    textChoiceSelection?: string;
    choices: { choiceId: string; isSelected: boolean }[];
}

function choiceIdForOption(option: OptionSelection): string | undefined {
    return option.textChoiceSelection || option.choices.find((c) => c.isSelected)?.choiceId;
}

/** The selected choice of each option, by option name (options without a selection are left out). */
export function selectedChoices(options: OptionSelection[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const option of options) {
        const choiceId = choiceIdForOption(option);
        if (choiceId) result[option._id] = choiceId;
    }
    return result;
}

/** True when every product option has a selection (vacuously true when there are no options). */
export function allOptionsHaveSelection(options: OptionSelection[]): boolean {
    for (const option of options) {
        if (!choiceIdForOption(option)) {
            return false;
        }
    }
    return true;
}

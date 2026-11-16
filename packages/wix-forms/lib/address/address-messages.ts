/**
 * English default messages for address fields (DL #52 §1, §3). Documented in the agent-kit
 * `user-visible-messages.md`. Labels are the resolved ones (config > default).
 */

export const addressMessages = {
    required: (label: string) => `${label} is required.`,
    countryNotOffered: () => 'Choose a country from the list.',
    tooManyCharacters: (label: string, maxLength: number) =>
        `${label} must be at most ${maxLength} characters.`,
    /** Correct only for `^.{0,50}$`, the one pattern every template uses (pinned by test A1). */
    patternFailed: (label: string) => `${label} is too long.`,
    notInList: (label: string) => `Choose a ${label} from the list.`,
    cannotAccept: (countryName: string) =>
        `This address cannot be accepted for ${countryName}. Please contact us.`,
    checkValue: (label: string) => `${label}: please check this value.`,
};

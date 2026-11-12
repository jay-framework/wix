/**
 * Which rule a field failed (DL#53 G1). Client-safe, like `submit-outcome.ts`.
 */

/**
 * The per-field `errorRule` contract variant. Member order IS the contract (DL#45): jay compiles
 * `enum (A | B)` to a numeric enum, and the generator renders these members.
 */
export enum FieldRule {
    NONE,
    REQUIRED,
    MIN_LENGTH,
    MAX_LENGTH,
    EMAIL,
    PHONE,
    URL,
    PATTERN,
    CUSTOM,
    /** Wix refused this value; `error` is Wix's text. */
    SERVER,
    /** A phone with no country code and no default country, or from a country the field refuses (DL#55 P1c). */
    PHONE_COUNTRY,
    /** The form's submit hook rejected this field (`FieldRejection`); `error` is the hook's text (DL #57 H). */
    HOOK,
}

/** A check's verdict: the failed rule and its default (English) message, or `NONE` and `''`. */
export interface FieldCheckResult {
    rule: FieldRule;
    message: string;
}

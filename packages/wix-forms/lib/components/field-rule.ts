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
    SERVER,
}

/** A check's verdict: the failed rule and its default (English) message, or `NONE` and `''`. */
export interface FieldCheckResult {
    rule: FieldRule;
    message: string;
}

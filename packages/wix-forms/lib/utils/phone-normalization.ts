/**
 * Phone normalization (DL#55 P1c). Client-safe and pure: one call gives both the browser verdict
 * and the value the plugin sends, so the two cannot disagree (Q31). Wix's caller (visitor) path
 * accepts only compact E.164, so a phone that passes is sent as `+<digits>`.
 */

import {
    getCountryCallingCode,
    parsePhoneNumberFromString,
    type CountryCode,
    type PhoneNumber,
} from 'libphonenumber-js/min';
import { FieldRule } from '../components/field-rule.js';
import type { PhoneRules } from '../types.js';

export type PhoneCheck =
    | { rule: FieldRule.NONE; e164: string }
    | { rule: FieldRule.PHONE | FieldRule.PHONE_COUNTRY };

/** The characters a phone may hold at all (DL#55 P1): letters, `ext`, `*#`, full-width digits fail. */
export const PHONE_CHARACTERS = /^[+()\-.\s\d]+$/;

const SEPARATORS = /[\s().-]/g;
/** 6: shorter input is a fragment, not a full local number; 15: the E.164 maximum. */
const LOCAL_DIGITS_ASKING_FOR_COUNTRY = { min: 6, max: 15 };

const INVALID: PhoneCheck = { rule: FieldRule.PHONE };
const NEEDS_COUNTRY: PhoneCheck = { rule: FieldRule.PHONE_COUNTRY };

/** The verdict on a non-empty trimmed phone value, and its E.164 form when it passes (DL#55 P1c). */
export function checkPhone(trimmed: string, rules: PhoneRules = {}): PhoneCheck {
    if (!PHONE_CHARACTERS.test(trimmed)) return INVALID;
    const compact = compactPhone(trimmed);
    const parsed = compact.startsWith('+')
        ? parseInternational(compact)
        : parseLocal(compact, rules.defaultCountry);
    if (!('number' in parsed)) return parsed;
    if (!isFromAllowedCountry(parsed.number, rules.allowedCountries)) return NEEDS_COUNTRY;
    return { rule: FieldRule.NONE, e164: parsed.number.number };
}

/** The calling codes of the accepted countries, deduplicated, in list order (`+972, +1`). */
export function callingCodesOf(countries: string[]): string[] {
    const codes = countries.map((country) => `+${getCountryCallingCode(country as CountryCode)}`);
    return [...new Set(codes)];
}

type Parsed = { number: PhoneNumber } | PhoneCheck;

/** Without separators; a leading `00` becomes `+` (Q38), before the local branch. */
function compactPhone(trimmed: string): string {
    const compact = trimmed.replace(SEPARATORS, '');
    return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

/** International input is sent when its length is possible; Wix decides the rest (Q33). */
function parseInternational(compact: string): Parsed {
    const number = parsePhoneNumberFromString(compact);
    return number?.isPossible() ? { number } : INVALID;
}

/** A local number needs a country, and must be valid in it: a wrong guess sends a wrong number (Q33). */
function parseLocal(compact: string, defaultCountry: string | undefined): Parsed {
    if (!defaultCountry) return localWithoutCountry(compact);
    const number = parsePhoneNumberFromString(compact, defaultCountry as CountryCode);
    return number?.isValid() ? { number } : INVALID;
}

function localWithoutCountry(compact: string): PhoneCheck {
    const { min, max } = LOCAL_DIGITS_ASKING_FOR_COUNTRY;
    const digitCount = compact.replace(/\D/g, '').length;
    return digitCount >= min && digitCount <= max ? NEEDS_COUNTRY : INVALID;
}

/** Q34: the parsed country is listed, or (country unknown) its calling code is a listed one's. */
function isFromAllowedCountry(
    number: PhoneNumber,
    allowedCountries: string[] | undefined,
): boolean {
    if (!allowedCountries?.length) return true;
    if (number.country) return allowedCountries.includes(number.country);
    return callingCodesOf(allowedCountries).includes(`+${number.countryCallingCode}`);
}

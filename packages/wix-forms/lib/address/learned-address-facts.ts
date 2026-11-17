/**
 * What Wix's 400s taught this server process about addresses (DL #52 Q6, Q17). Server-only, one
 * instance per `WixFormsService`, shared by bookings and per-form. Not persisted.
 *
 * Keys are the codes Wix accepts, so the key space is bounded at 247; each entry expires 1 h
 * after its last write.
 */

import type { FormFieldOptionView } from '../types.js';
import { ADDRESS_COUNTRY_CODES } from './address-countries.js';
import { resolveAddressLabels } from './address-labels.js';
import {
    isLayoutPart,
    type AddressLabelsConfig,
    type CountryCode,
    type LayoutPart,
    type LearnedFactsSnapshot,
} from './address-types.js';

export const LEARNED_FACT_TTL_MS = 60 * 60 * 1000;
const MAX_LEARNED_CODES = 200;
const LEARNED_CODE = /^[A-Z0-9]{1,3}$/;

export interface LearnedAddressFacts {
    subdivisionsOf(country: CountryCode): string[] | undefined;
    learnSubdivisions(country: CountryCode, codes: readonly string[]): void;
    /** `[]` when none. */
    revealedPartsOf(country: CountryCode): LayoutPart[];
    revealPart(country: CountryCode, part: LayoutPart): void;
    /** Every unexpired entry; learned codes as options labelled by config, else by code. */
    snapshot(): LearnedFactsSnapshot;
}

export interface LearnedAddressFactsOptions {
    now?: () => number;
    /** `address.labels` from config: names learned codes in `snapshot()`. */
    labels?: AddressLabelsConfig;
}

interface Entry<T> {
    value: T;
    expiresAt: number;
}

export function createLearnedAddressFacts(
    options: LearnedAddressFactsOptions = {},
): LearnedAddressFacts {
    const now = options.now ?? Date.now;
    const labels = resolveAddressLabels(options.labels);
    const subdivisions = new Map<CountryCode, Entry<string[]>>();
    const revealed = new Map<CountryCode, Entry<LayoutPart[]>>();
    const accepted = new Set(ADDRESS_COUNTRY_CODES);

    function live<T>(store: Map<CountryCode, Entry<T>>, country: CountryCode): T | undefined {
        const entry = store.get(country);
        if (!entry) return undefined;
        if (now() < entry.expiresAt) return entry.value;
        store.delete(country);
        return undefined;
    }

    function keep<T>(store: Map<CountryCode, Entry<T>>, country: CountryCode, value: T): void {
        store.set(country, { value, expiresAt: now() + LEARNED_FACT_TTL_MS });
    }

    function liveEntries<T>(store: Map<CountryCode, Entry<T>>): Array<[CountryCode, T]> {
        return [...store.keys()].flatMap((country) => {
            const value = live(store, country);
            return value === undefined ? [] : [[country, value] as [CountryCode, T]];
        });
    }

    return {
        subdivisionsOf: (country) => live(subdivisions, country),
        learnSubdivisions(country, codes) {
            const normalised = normaliseCodes(codes);
            if (!accepted.has(country) || !normalised) return;
            keep(subdivisions, country, normalised);
        },
        revealedPartsOf: (country) => live(revealed, country) ?? [],
        revealPart(country, part) {
            if (!accepted.has(country) || !isLayoutPart(part)) return;
            const current = live(revealed, country) ?? [];
            keep(revealed, country, current.includes(part) ? current : [...current, part]);
        },
        snapshot() {
            const subdivisionsOf = Object.fromEntries(
                liveEntries(subdivisions).map(([country, codes]) => [
                    country,
                    codes.map(
                        (code): FormFieldOptionView => ({
                            value: code,
                            label: labels.subdivisionName(country, code),
                        }),
                    ),
                ]),
            );
            const revealedPartsOf = Object.fromEntries(liveEntries(revealed));
            return {
                ...(Object.keys(subdivisionsOf).length ? { subdivisionsOf } : {}),
                ...(Object.keys(revealedPartsOf).length ? { revealedPartsOf } : {}),
            };
        },
    };
}

/** Upper-cased and de-duplicated; undefined (the whole write ignored) when any code is malformed. */
function normaliseCodes(codes: readonly string[]): string[] | undefined {
    if (!Array.isArray(codes)) return undefined;
    const normalised = [...new Set(codes.map((code) => String(code).toUpperCase()))];
    if (normalised.length < 1 || normalised.length > MAX_LEARNED_CODES) return undefined;
    return normalised.every((code) => LEARNED_CODE.test(code)) ? normalised : undefined;
}

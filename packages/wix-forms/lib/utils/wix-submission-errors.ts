/**
 * Reads Wix Forms' 400 body into per-field errors and the rules the plugin recognises (DL#55 P2).
 * Pure; server-side use only (the raw Wix body never leaves the server).
 */

import { FieldRule } from '../components/field-rule.js';

/** One item of a Wix 400: details.validationError.fieldViolations[].data.errors[] (L1). */
interface WixSubmissionError {
    errorPath?: string;
    errorType?: string;
    errorMessage?: string;
    customErrorMessage?: string;
    params?: { format?: string };
}

interface WixSubmissionErrorBody {
    details?: {
        validationError?: {
            fieldViolations?: Array<{ data?: { errors?: WixSubmissionError[] } }>;
        };
    };
}

export interface SubmissionViolations {
    /** target → Wix text (first item per target). Items without errorPath are dropped. */
    fieldErrors: Record<string, string>;
    /** target → rule, only for items the plugin recognises. */
    fieldRules: Record<string, FieldRule>;
}

/** Only the `params.format` values seen live (L1). */
const FORMAT_RULE_OF_WIX_FORMAT: Record<string, FieldRule> = {
    email: FieldRule.EMAIL,
    phone: FieldRule.PHONE,
    url: FieldRule.URL,
};

export function parseSubmissionViolations(responseBody: string): SubmissionViolations {
    const violations: SubmissionViolations = { fieldErrors: {}, fieldRules: {} };
    for (const error of submissionErrorsOf(responseBody)) {
        const target = error.errorPath;
        if (!target || Object.hasOwn(violations.fieldErrors, target)) continue;
        violations.fieldErrors[target] =
            error.customErrorMessage ?? error.errorMessage ?? 'Invalid value';
        const rule = fieldRuleOfWixError(error);
        if (rule !== undefined) violations.fieldRules[target] = rule;
    }
    return violations;
}

/** undefined = unmapped (SERVER). An item with customErrorMessage is always unmapped. */
export function fieldRuleOfWixError(error: WixSubmissionError): FieldRule | undefined {
    if (error.customErrorMessage !== undefined) return undefined;
    if (error.errorType === 'REQUIRED_VALUE_ERROR') return FieldRule.REQUIRED; // not observed live
    const format = (error.params?.format ?? '').toLowerCase();
    if (error.errorType === 'FORMAT_ERROR') return FORMAT_RULE_OF_WIX_FORMAT[format];
    // A country outside the accepted list or an unassigned number (L7/L8(3)); both read as an
    // invalid phone, so the page's PHONE copy applies (DL#55 follow-up 2026-11-12).
    if (error.errorType === 'NOT_ALLOWED_VALUE_ERROR' && format === 'phone') return FieldRule.PHONE;
    return undefined;
}

function submissionErrorsOf(responseBody: string): WixSubmissionError[] {
    try {
        const parsed = JSON.parse(responseBody) as WixSubmissionErrorBody;
        const fieldViolations = parsed.details?.validationError?.fieldViolations ?? [];
        return fieldViolations.flatMap((violation) => violation.data?.errors ?? []);
    } catch {
        return [];
    }
}

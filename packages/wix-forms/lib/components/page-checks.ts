/**
 * Runs a page's own field rules (DL#53 G1) for one form. Client-safe.
 *
 * The context is looked up at call time (Q8): checks registered after the form was constructed
 * still run, and without the plugin's client init no checks run and nothing throws.
 */

import { useGlobalContext } from '@jay-framework/runtime';
import type { FieldValue, FormFieldView } from '../types.js';
import {
    registeredFieldChecks,
    WIX_FORMS_CONTEXT,
    type FieldCheck,
    type FieldChecks,
} from '../contexts/wix-forms-context.js';
import { FieldRule, type FieldCheckResult } from './field-rule.js';

export type PageCheckRunner = (
    field: FormFieldView,
    value: FieldValue,
    values: Readonly<Record<string, FieldValue>>,
) => FieldCheckResult;

const PASSED: FieldCheckResult = { rule: FieldRule.NONE, message: '' };

/** The first registered check of `field.target` that fails, as `CUSTOM` with its message. */
export function createPageCheckRunner(formId: string, fields: FormFieldView[]): PageCheckRunner {
    const visibleTargets = new Set(
        fields.filter((field) => !field.hidden).map((field) => field.target),
    );
    const targetsWarnedAbout = new Set<string>();
    const registrationsScanned = new WeakSet<FieldChecks>();
    const checksLoggedAbout = new WeakSet<FieldCheck>();

    /**
     * Checks are registered in TypeScript at runtime, so no validator sees them: warn once. Each
     * registration is scanned once, not on every check (every keystroke while an error shows).
     */
    function warnAboutUnknownTargets(registrations: FieldChecks[]): void {
        const unscanned = registrations.filter((checks) => !registrationsScanned.has(checks));
        unscanned.forEach((checks) => registrationsScanned.add(checks));
        for (const target of unscanned.flatMap((checks) => Object.keys(checks))) {
            if (visibleTargets.has(target) || targetsWarnedAbout.has(target)) continue;
            targetsWarnedAbout.add(target);
            console.warn(
                `[wix-forms] field checks registered for "${target}", which is not a visible field of form ${formId}; they never run`,
            );
        }
    }

    /** A page bug must not block submit: a throwing check is logged once and passes. */
    function runCheck(
        check: FieldCheck,
        value: FieldValue,
        values: Readonly<Record<string, FieldValue>>,
    ): string | undefined {
        try {
            return check(value, values);
        } catch (error) {
            if (!checksLoggedAbout.has(check)) {
                checksLoggedAbout.add(check);
                console.error(
                    '[wix-forms] a field check threw; treated as passing',
                    { formId },
                    error,
                );
            }
            return undefined;
        }
    }

    return (field, value, values) => {
        const context = useGlobalContext(WIX_FORMS_CONTEXT);
        if (!context) return PASSED;
        const registrations = registeredFieldChecks(context, formId);
        warnAboutUnknownTargets(registrations);
        for (const checks of registrations) {
            const fieldChecks = Object.prototype.hasOwnProperty.call(checks, field.target)
                ? checks[field.target]
                : [];
            for (const check of Array.isArray(fieldChecks) ? fieldChecks : []) {
                const message = runCheck(check, value, values);
                if (typeof message === 'string' && message) {
                    return { rule: FieldRule.CUSTOM, message };
                }
            }
        }
        return PASSED;
    };
}

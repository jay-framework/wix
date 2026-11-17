/**
 * Runs a page's own field rules (DL#53 G1) for one form. Client-safe.
 *
 * The context is looked up at call time (Q8): checks registered after the form was constructed
 * still run, and without the plugin's client init no checks run and nothing throws.
 */

import { useGlobalContext } from '@jay-framework/runtime';
import type { FieldValue, FormFieldView } from '../types.js';
import {
    registeredFields,
    WIX_FORMS_CONTEXT,
    type FieldCheck,
    type FieldRegistration,
} from '../contexts/wix-forms-context.js';
import { FieldRule, type FieldCheckResult } from './field-rule.js';

export type PageCheckRunner = (
    field: FormFieldView,
    value: FieldValue,
    values: Readonly<Record<string, FieldValue>>,
) => FieldCheckResult;

/** The page's own text for `rule` on `field`, if it registered one (DL #59). */
export type PageWording = (field: FormFieldView, rule: FieldRule) => string | undefined;

export interface PageCheckRunners {
    runPageChecks: PageCheckRunner;
    pageWordingFor: PageWording;
}

const PASSED: FieldCheckResult = { rule: FieldRule.NONE, message: '' };

/** Rules whose text is already the page's or a hook's own, so never reworded. */
const UNWORDABLE_RULES = new Set([FieldRule.NONE, FieldRule.CUSTOM, FieldRule.HOOK]);

/**
 * `runPageChecks`: the first registered check of `field.target` that fails, as `CUSTOM` with its
 * message. `pageWordingFor`: the first registration's wording for a field and rule.
 */
export function createPageCheckRunner(formId: string, fields: FormFieldView[]): PageCheckRunners {
    const visibleTargets = new Set(
        fields.filter((field) => !field.hidden).map((field) => field.target),
    );
    const targetsWarnedAbout = new Set<string>();
    const registrationsScanned = new WeakSet<FieldRegistration>();
    const checksLoggedAbout = new WeakSet<FieldCheck>();

    /**
     * Checks are registered in TypeScript at runtime, so no validator sees them: warn once. Each
     * registration is scanned once, not on every check (every keystroke while an error shows).
     */
    function warnAboutUnknownTargets(registrations: FieldRegistration[]): void {
        const unscanned = registrations.filter((record) => !registrationsScanned.has(record));
        unscanned.forEach((record) => registrationsScanned.add(record));
        const targets = unscanned.flatMap((record) => [
            ...Object.keys(record.checks),
            ...Object.keys(record.messages),
        ]);
        for (const target of targets) {
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

    /** Looked up at call time, like checks; scanning once per registration for unknown targets. */
    function currentRegistrations(): FieldRegistration[] {
        const context = useGlobalContext(WIX_FORMS_CONTEXT);
        if (!context) return [];
        const registrations = registeredFields(context, formId);
        warnAboutUnknownTargets(registrations);
        return registrations;
    }

    const pageWordingFor: PageWording = (field, rule) => {
        if (UNWORDABLE_RULES.has(rule)) return undefined;
        for (const { messages } of currentRegistrations()) {
            const wording = ownEntry(messages, field.target)?.[rule];
            if (typeof wording === 'string' && wording) return wording;
        }
        return undefined;
    };

    const runPageChecks: PageCheckRunner = (field, value, values) => {
        for (const { checks } of currentRegistrations()) {
            const fieldChecks = ownEntry(checks, field.target);
            for (const check of Array.isArray(fieldChecks) ? fieldChecks : []) {
                const message = runCheck(check, value, values);
                if (typeof message === 'string' && message) {
                    return { rule: FieldRule.CUSTOM, message };
                }
            }
        }
        return PASSED;
    };

    return { runPageChecks, pageWordingFor };
}

function ownEntry<T>(record: Record<string, T>, key: string): T | undefined {
    return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

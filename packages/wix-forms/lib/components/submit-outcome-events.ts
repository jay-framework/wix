/**
 * Reports each settled submit to page code through `WIX_FORMS_CONTEXT.onSubmitOutcome`
 * (DL#53 G3). Client-safe.
 *
 * The context is looked up at call time (Q8): without the plugin's client init nothing is
 * emitted and nothing throws. A page handler that throws is logged, never allowed to break the
 * form's own submit flow.
 */

import { useGlobalContext } from '@jay-framework/runtime';
import {
    emitSubmitOutcome,
    WIX_FORMS_CONTEXT,
    type SubmitOutcomeEvent,
} from '../contexts/wix-forms-context.js';
import { canonicalFormId } from '../utils/form-id.js';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An outcome without its form id; the reporter adds the canonical one. */
export type SubmitOutcome = DistributiveOmit<SubmitOutcomeEvent, 'formId'>;

export type SubmitOutcomeReporter = (outcome: SubmitOutcome) => void;

export function createSubmitOutcomeReporter(formId: string): SubmitOutcomeReporter {
    const reportedFormId = canonicalFormId(formId) ?? formId;
    return (outcome) => {
        const context = useGlobalContext(WIX_FORMS_CONTEXT);
        if (!context) return;
        try {
            emitSubmitOutcome(context, { formId: reportedFormId, ...outcome });
        } catch (error) {
            console.error('[wix-forms] an onSubmitOutcome handler threw', {
                formId: reportedFormId,
                error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            });
        }
    };
}

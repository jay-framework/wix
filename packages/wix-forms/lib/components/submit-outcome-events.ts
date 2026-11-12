/**
 * Reports each submit hand-off and each settled submit to page code through
 * `WIX_FORMS_CONTEXT.onSubmitStart` / `onSubmitOutcome` (DL#53 G3, DL #56 G6). Client-safe.
 *
 * The context is looked up at call time (Q8): without the plugin's client init nothing is
 * emitted and nothing throws. The context isolates each page handler (DL #56 L1), so a throwing
 * handler is logged and can never break the form's own submit flow.
 */

import { useGlobalContext } from '@jay-framework/runtime';
import {
    emitSubmitOutcome,
    emitSubmitStart,
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
        if (context) emitSubmitOutcome(context, { formId: reportedFormId, ...outcome });
    };
}

/** Reports that the form handed one submit to the server (DL #56 G6). */
export function createSubmitStartReporter(formId: string): () => void {
    const reportedFormId = canonicalFormId(formId) ?? formId;
    return () => {
        const context = useGlobalContext(WIX_FORMS_CONTEXT);
        if (context) emitSubmitStart(context, { formId: reportedFormId });
    };
}

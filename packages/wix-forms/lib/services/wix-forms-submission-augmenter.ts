/**
 * Optional submission augmenter (DL#39 Capability 4b).
 *
 * A project that needs SERVER-DERIVED submission values (a lookup, a computed field)
 * registers an augmenter into this marker from its own `init`, exactly as plugins
 * register their services. The `submitForm` action resolves it with a non-throwing
 * `hasService` guard before `createSubmission`, so the hook is fully optional.
 *
 * This is plugin-only — NO jay change. The 4b spike confirmed (at the code level) that
 * action handlers resolve `.withServices()` at request time via the same module-global
 * `serviceRegistry` that `hasService`/`getService` read, so a direct `getService` call
 * inside the handler resolves identically. See DL#39 §Design 4b / §Jay Dependency.
 */

import { createJayService } from '@jay-framework/fullstack-component';
import type { FieldValue } from '../types.js';

export interface SubmissionAugmentInput {
    formId: string;
    /** The DOM-derived submission values, before augmentation. */
    values: Record<string, FieldValue>;
}

export interface SubmissionAugmenter {
    /**
     * Return a PARTIAL map of server-derived values. The result is shallow-merged OVER
     * the DOM values, so a returned key overwrites the same-named DOM value. Throwing
     * aborts the submission and surfaces as a submit error (no `createSubmission` call).
     */
    augment(input: SubmissionAugmentInput): Promise<Record<string, FieldValue>>;
}

export const WIX_FORMS_SUBMISSION_AUGMENTER = createJayService<SubmissionAugmenter>(
    'WixFormsSubmissionAugmenter',
);

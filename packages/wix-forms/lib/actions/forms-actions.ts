import { makeJayQuery, makeJayAction } from '@jay-framework/fullstack-component';
import { hasService, getService } from '@jay-framework/stack-server-runtime';
import { WIX_FORMS_SERVICE } from '../services/wix-forms-service-marker.js';
import { WIX_FORMS_SUBMISSION_AUGMENTER } from '../services/wix-forms-submission-augmenter.js';
import type { FieldValue } from '../types.js';

export const getFormSummary = makeJayQuery('wixForms.getFormSummary')
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(async (input: { formId?: string }, forms) => {
        const fields = await forms.getFormSummaryFields(input.formId);
        return { fields };
    });

export const submitForm = makeJayAction('wixForms.submitForm')
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(
        async (input: { formId?: string; values: Record<string, FieldValue> }, forms) => {
            const formId = input.formId ?? '';
            // Optional server-derived values (DL#39 4b): a project registers an augmenter
            // into WIX_FORMS_SUBMISSION_AUGMENTER; absent one, the DOM values submit as-is.
            // The augmenter result is shallow-merged OVER the DOM values (server wins).
            const values = hasService(WIX_FORMS_SUBMISSION_AUGMENTER)
                ? {
                      ...input.values,
                      ...(await getService(WIX_FORMS_SUBMISSION_AUGMENTER).augment({
                          formId,
                          values: input.values,
                      })),
                  }
                : input.values;
            await forms.createSubmission(formId, values);
            return { success: true };
        },
    );

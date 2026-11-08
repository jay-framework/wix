import { makeJayQuery, makeJayAction } from '@jay-framework/fullstack-component';
import { WIX_FORMS_SERVICE } from '../services/wix-forms-service-marker.js';
import { runSubmission } from '../submission/run-submission.js';
import type { SubmitRequestInput } from '../types.js';

export const getFormSummary = makeJayQuery('wixForms.getFormSummary')
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(async (input: { formId?: string }, forms) => {
        const fields = await forms.getFormSummaryFields(input.formId);
        return { fields };
    });

export const submitForm = makeJayAction('wixForms.submitForm')
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(async (input: SubmitRequestInput, forms) => {
        const formId = input.formId ?? '';
        return runSubmission(
            { formId, values: input.values },
            { createSubmission: (id, submitted) => forms.createSubmission(id, submitted) },
        );
    });

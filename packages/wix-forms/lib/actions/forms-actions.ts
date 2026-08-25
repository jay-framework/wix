import { makeJayQuery, makeJayAction } from '@jay-framework/fullstack-component';
import { WIX_FORMS_SERVICE } from '../services/wix-forms-service-marker.js';

export const getFormSummary = makeJayQuery('wixForms.getFormSummary')
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(async (input: { formId?: string }, forms) => {
        const fields = await forms.getFormSummaryFields(input.formId);
        return { fields };
    });

export const submitForm = makeJayAction('wixForms.submitForm')
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(async (input: { formId?: string; values: Record<string, string> }, forms) => {
        await forms.createSubmission(input.formId ?? '', input.values);
        return { success: true };
    });

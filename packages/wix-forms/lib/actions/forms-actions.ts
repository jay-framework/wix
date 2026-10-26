import { makeJayQuery, makeJayAction } from '@jay-framework/fullstack-component';
import { hasService, getService } from '@jay-framework/stack-server-runtime';
import { resolveRequestIdentity } from '@jay-framework/wix-server-client';
import { WIX_FORMS_SERVICE } from '../services/wix-forms-service-marker.js';
import { WIX_FORMS_SUBMIT_HOOKS } from '../services/wix-forms-submit-hooks.js';
import { runSubmission, selectHook } from '../submission/run-submission.js';
import type { SubmitFormResult, SubmitRequestInput } from '../types.js';

export const getFormSummary = makeJayQuery('wixForms.getFormSummary')
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(async (input: { formId?: string }, forms) => {
        const fields = await forms.getFormSummaryFields(input.formId);
        return { fields };
    });

/** DL#42 §Design 3: a thin wrapper; `runSubmission` returns every outcome. */
export const submitForm = makeJayAction('wixForms.submitForm')
    .withRequest()
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(async (input: SubmitRequestInput, request, forms): Promise<SubmitFormResult> => {
        const hooks = hasService(WIX_FORMS_SUBMIT_HOOKS)
            ? getService(WIX_FORMS_SUBMIT_HOOKS)
            : undefined;
        return runSubmission(input, {
            createSubmission: (formId, values) => forms.createSubmission(formId, values),
            resolveIdentity: async () => {
                const identity = resolveRequestIdentity(request.cookies);
                return { caller: await identity.caller, client: identity.client };
            },
            hook: selectHook(hooks, input.formId ?? ''),
        });
    });

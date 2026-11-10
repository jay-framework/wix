import { makeJayQuery, makeJayAction, ActionError } from '@jay-framework/fullstack-component';
import { hasService, getService } from '@jay-framework/stack-server-runtime';
import { resolveRequestIdentity } from '@jay-framework/wix-server-client';
import { WIX_FORMS_SERVICE } from '../services/wix-forms-service-marker.js';
import { WIX_FORMS_SUBMIT_HOOKS } from '../services/wix-forms-submit-hooks.js';
import { identitySubmitDeps, runSubmission, selectHook } from '../submission/run-submission.js';
import type { SubmitFormResult, SubmitRequestInput } from '../types.js';
import { canonicalFormId } from '../utils/form-id.js';

export const getFormSummary = makeJayQuery('wixForms.getFormSummary')
    .withServices(WIX_FORMS_SERVICE)
    .withHandler(async (input: { formId?: string }, forms) => {
        const formId = requireSummaryFormId(input.formId);
        const fields = await forms.getFormSummaryFields(formId);
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
        const requestIdentity = resolveRequestIdentity(request.cookies);
        const { resolveClient, resolveIdentity } = identitySubmitDeps(requestIdentity);
        return runSubmission(input, {
            createSubmission: (formId, values, authorization) =>
                forms.createSubmission(formId, values, authorization),
            resolveClient,
            resolveIdentity,
            isSubmittableForm: (formId) => forms.isSubmittableForm(formId),
            hook: selectHook(hooks, input.formId ?? ''),
        });
    });

/** A missing or non-GUID form id is the caller's mistake: a 4xx ActionError, never a 500 (DL#49). */
function requireSummaryFormId(formId: string | undefined): string {
    if (!formId) {
        throw new ActionError(
            'INVALID_INPUT',
            'Form ID is missing. This booking service has no participant form configured in Wix.',
        );
    }
    if (!canonicalFormId(formId)) {
        throw new ActionError('INVALID_INPUT', 'Form ID is not a valid Wix form id.');
    }
    return formId;
}

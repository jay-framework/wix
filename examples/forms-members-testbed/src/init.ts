/**
 * Project init: the demo submit hook for the contact form (wix-forms DL#42 Phase 4).
 *
 * Registered inside `.withServer(...)`, which the client build strips: a top-level
 * `registerService` here would ship the hook to the browser.
 */

import { ActionError, makeJayInit } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { WIX_FORMS_SUBMIT_HOOKS, type SubmitHook } from '@jay-framework/wix-forms';

/** "ContactMyForm" (agent-kit/plugins-index.yaml). */
const CONTACT_FORM_ID = 'e87b4d6f-6a0f-4b5b-b730-63b9fa236f35';
const FIRST_NAME = 'first_name_d142';
const EMAIL = 'email_76b1';

/** Stand-in for a real reservations table: reference → caller id. */
const demoReservations = new Map<string, string>();

const contactHook: SubmitHook = async ({ values, caller, submit }) => {
    const firstName = String(values[FIRST_NAME] ?? '').trim().toLowerCase();
    if (firstName === 'paused') {
        throw new ActionError('DEMO_BLOCKED', 'Submissions are paused (demo).');
    }
    const reference = `DEMO-${crypto.randomUUID().slice(0, 8)}`;
    demoReservations.set(reference, caller?.id ?? 'anonymous');
    // 'wixreject' sends an invalid email, so Wix rejects the submission and we compensate.
    const submitted = firstName === 'wixreject' ? { ...values, [EMAIL]: 'not-an-email' } : values;
    try {
        await submit(submitted);
    } catch (error) {
        demoReservations.delete(reference);
        console.log(`[testbed hook] Wix rejected the submission; released reservation ${reference}`);
        throw error;
    }
    const callerType = caller?.type ?? 'NONE';
    return {
        redirectTo: `/contact/confirmed?ref=${encodeURIComponent(reference)}&caller=${callerType}`,
    };
};

export const init = makeJayInit().withServer(async () => {
    registerService(WIX_FORMS_SUBMIT_HOOKS, { [CONTACT_FORM_ID]: contactHook });
    return {};
});

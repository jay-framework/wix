// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalContextRegistry, useGlobalContext } from '@jay-framework/runtime';
import {
    provideWixFormsContext,
    registeredFieldChecks,
    WIX_FORMS_CONTEXT,
    emitSubmitOutcome,
} from '../../lib/contexts/wix-forms-context.js';

const FORM_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const passes = () => undefined;
const fails = () => 'nope';

afterEach(() => {
    clearGlobalContextRegistry();
    vi.restoreAllMocks();
});

describe('WIX_FORMS_CONTEXT (DL#53 G1)', () => {
    it('should register the context globally when provided', () => {
        const context = provideWixFormsContext();
        expect(useGlobalContext(WIX_FORMS_CONTEXT)).toBe(context);
    });

    it('should return the checks registered for a form id, in any case', () => {
        const context = provideWixFormsContext();
        const checks = { phone: [fails] };
        context.registerFieldChecks(FORM_ID.toUpperCase(), checks);

        expect(registeredFieldChecks(context, FORM_ID)).toEqual([checks]);
    });

    it('should keep every registration for a form in registration order', () => {
        const context = provideWixFormsContext();
        const first = { phone: [fails] };
        const second = { phone: [passes] };
        context.registerFieldChecks(FORM_ID, first);
        context.registerFieldChecks(FORM_ID, second);

        expect(registeredFieldChecks(context, FORM_ID)).toEqual([first, second]);
    });

    it('should drop a registration when its unregister function is called', () => {
        const context = provideWixFormsContext();
        const unregister = context.registerFieldChecks(FORM_ID, { phone: [fails] });
        unregister();

        expect(registeredFieldChecks(context, FORM_ID)).toEqual([]);
    });

    it('should warn once about a key that is not a form id, and never match it', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const context = provideWixFormsContext();
        context.registerFieldChecks('booking-form', { phone: [fails] });
        context.registerFieldChecks('booking-form', { phone: [fails] });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('"booking-form" is not a form id');
        expect(registeredFieldChecks(context, 'booking-form')).toEqual([]);
    });
});

/**
 * Bug: onSubmitOutcome handlers from unmounted page components pile up.
 * Found in: code review of wix-forms step 13, suggestion 2 (DL#53 P6).
 * Expected: subscribing returns an unsubscribe function; after it runs the handler no longer fires.
 * Actual: jay's createEvent only pushes handlers; the public EventEmitter type has no way to remove
 * one, so a global-context handler outlives the page that subscribed it.
 */
describe('WIX_FORMS_CONTEXT onSubmitOutcome (DL#53 G3)', () => {
    const event = { formId: FORM_ID, outcome: 'succeeded' as const };

    it('should call each subscribed handler with { event }', () => {
        const context = provideWixFormsContext();
        const handler = vi.fn();
        context.onSubmitOutcome(handler);
        emitSubmitOutcome(context, event);
        expect(handler).toHaveBeenCalledWith({ event });
    });

    it('should stop calling a handler once its unsubscribe function is called', () => {
        const context = provideWixFormsContext();
        const handler = vi.fn();
        const unsubscribe = context.onSubmitOutcome(handler);
        unsubscribe();
        emitSubmitOutcome(context, event);
        expect(handler).not.toHaveBeenCalled();
    });
});

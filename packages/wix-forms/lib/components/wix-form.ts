/**
 * Shared Wix Form component (DL#40, extended by DL#41).
 *
 * One schema-agnostic component serves every per-form contract. It reads the
 * form identity from `props.metadata.formId` (set by the generator), loads that
 * form's fields in the slow phase, and builds a view-state object KEYED BY FIELD
 * TARGET plus the reserved form-level tags.
 *
 * DL#41 turns this into general forms infrastructure. Everything rests on ONE
 * per-field value store (§0): a `Record<target, value>` signal that is the single
 * source of truth for each field's current value. Submission, prefill, live
 * validation, hidden/custom-UI values, and the confirmation echo are all thin
 * consumers of that store.
 */

import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type PageProps,
    type DynamicContractProps,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, Props, useReactive } from '@jay-framework/component';
import { WIX_FORMS_SERVICE, type WixFormsService } from '../services/wix-forms-service-marker.js';
import { ensureSessionFresh } from '@jay-framework/wix-server-client/client';
import type { FieldValue, FormFieldView, SubmitFormResult } from '../types.js';
import { submitForm } from '../actions/forms-actions.js';
import { checkFormField } from '../utils/project-form-fields.js';
import { FieldRule, type FieldCheckResult } from './field-rule.js';
import { createPageCheckRunner } from './page-checks.js';
import { createSubmitOutcomeReporter } from './submit-outcome-events.js';
import {
    presentSubmitRejection,
    SUBMIT_FAILED_MESSAGE,
    SubmitFailure,
    toSitePath,
    type SubmitRejection,
} from './submit-outcome.js';
import {
    emptyStoreFor,
    emptyValueFor,
    projectSubmissionValues,
    seedControlValues,
    toggleSelection,
    validateVisibleFields,
    type ControlSeed,
    type OptionToggle,
} from './submission-values.js';
import {
    SLOW_RENDER_TTL,
    SLOW_RENDER_GRACE,
    SLOW_RENDER_ERROR_TTL,
} from '../slow-render-defaults.js';
import { contractTagName } from '../generators/contract-utils.js';
import { buildFormViewState } from './form-view-state.js';
import { createSubmitFlight } from './form-submit-flight.js';
import { runFormSubmit } from './form-submit-execution.js';
import { guardNativeFormSubmit } from './form-submit-guard.js';

interface WixFormMetadata {
    formId: string;
}

type WixFormProps = PageProps & DynamicContractProps<WixFormMetadata>;

interface WixFormCarryForward {
    formId: string;
    fields: FormFieldView[];
    loadError?: string;
}

async function renderSlowlyChanging(props: WixFormProps, forms: WixFormsService) {
    const formId = props.metadata?.formId ?? '';
    try {
        const fields = await forms.getFormFields(formId);
        return phaseOutput<Record<string, unknown>, WixFormCarryForward>(
            buildFormViewState(fields, { isSubmitting: false, statusMessage: '', loadError: '' }),
            { formId, fields },
            { ttl: SLOW_RENDER_TTL, grace: SLOW_RENDER_GRACE },
        );
    } catch (error) {
        const loadError = describeLoadError(error);
        console.error('[wix-form] getFormFields failed:', error);
        return phaseOutput<Record<string, unknown>, WixFormCarryForward>(
            buildFormViewState([], { isSubmitting: false, statusMessage: '', loadError }),
            { formId, fields: [], loadError },
            { ttl: SLOW_RENDER_ERROR_TTL },
        );
    }
}

async function renderFastChanging(props: WixFormProps, carryForward: WixFormCarryForward) {
    const Pipeline = RenderPipeline.for<Record<string, unknown>, WixFormCarryForward>();
    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: buildFormViewState(carryForward.fields, {
            isSubmitting: false,
            statusMessage: '',
            loadError: carryForward.loadError ?? '',
        }),
        carryForward,
    }));
}

function WixFormInteractive(
    _props: Props<WixFormProps>,
    refs: any,
    _viewStateSignals: Signals<Record<string, unknown>>,
    carryForward: WixFormCarryForward,
) {
    const [isSubmitting, setIsSubmitting] = createSignal(false);
    const [statusMessage, setStatusMessage] = createSignal('');
    const [errorByTarget, setErrorByTarget] = createSignal<Record<string, string>>({});
    const [invalidByTarget, setInvalidByTarget] = createSignal<Record<string, boolean>>({});
    // Which rule each shown error comes from (DL#53 G1); written and cleared with errorByTarget.
    const [ruleByTarget, setRuleByTarget] = createSignal<Record<string, FieldRule>>({});
    const [isSubmitted, setIsSubmitted] = createSignal(false);
    const [submitFailure, setSubmitFailure] = createSignal(SubmitFailure.NONE);
    // The per-field value store — the one source of truth for each field's value (§0).
    const [values, setValues] = createSignal<Record<string, FieldValue>>({});
    // Fields the user has edited; page-provided control seeding never overwrites these.
    const dirtyTargets = new Set<string>();
    // Honeypot value is kept OUT of the store so it never reaches readFormValues (Q12).
    let honeypotValue = '';
    const submitFlight = createSubmitFlight();
    // Each visible single select's DOM value at mount / after reset: the autofill baseline (DL#53 G2).
    const selectBaselineByTarget = new Map<string, string>();
    const runPageChecks = createPageCheckRunner(carryForward.formId, carryForward.fields);
    const reportSubmitOutcome = createSubmitOutcomeReporter(carryForward.formId);

    function setFieldValue(target: string, value: FieldValue): void {
        setValues((current) => ({ ...current, [target]: value }));
    }

    /**
     * Submission payload — a synchronous projection of the store (§0). Submit first copies
     * autofilled native values into the store (`reconcileNativeInputs`, DL#53 G2).
     */
    function readFormValues(): Record<string, FieldValue> {
        return projectSubmissionValues(carryForward.fields, values());
    }

    /**
     * The built-in rules, then — only when they pass — the page's own checks (DL#53 G1). Blur and
     * typing check the stored value; submit passes the submitted value and values.
     */
    function checkField(
        field: FormFieldView,
        value: FieldValue = values()[field.target] ?? emptyValueFor(field),
        allValues: Readonly<Record<string, FieldValue>> = readFormValues(),
    ): FieldCheckResult {
        const builtIn = checkFormField(field, value);
        return builtIn.rule === FieldRule.NONE ? runPageChecks(field, value, allValues) : builtIn;
    }

    function validateField(field: FormFieldView): void {
        const { rule, message } = checkField(field);
        setErrorByTarget((current) => ({ ...current, [field.target]: message }));
        setInvalidByTarget((current) => ({ ...current, [field.target]: Boolean(message) }));
        setRuleByTarget((current) => ({ ...current, [field.target]: rule }));
    }

    function clearFieldError(field: FormFieldView): void {
        setErrorByTarget((current) => ({ ...current, [field.target]: '' }));
        setInvalidByTarget((current) => ({ ...current, [field.target]: false }));
        setRuleByTarget((current) => ({ ...current, [field.target]: FieldRule.NONE }));
    }

    /** Push a store value back into a native input for visual consistency (Q5, Q6). */
    function reflectToInput(field: FormFieldView, value: FieldValue): void {
        const fieldRef = refs[contractTagName(field.target)];
        fieldRef?.input?.exec$((element: HTMLElement) => {
            if (field.inputType === 'checkbox') {
                (element as HTMLInputElement).checked = value === true;
            } else if (field.inputType === 'multiselect') {
                const selected = Array.isArray(value) ? value : [];
                for (const option of Array.from((element as HTMLSelectElement).options)) {
                    option.selected = selected.includes(option.value);
                }
            } else {
                (element as HTMLInputElement).value = typeof value === 'string' ? value : '';
            }
        });
        // A chip page binds per-option checkboxes and no `input`; set each one's `checked` (DL#44 §3).
        if (field.inputType === 'multiselect') {
            const selected = Array.isArray(value) ? value : [];
            fieldRef?.options?.toggle?.map(
                (option: any, item: { value: string }) =>
                    void option.exec$((element: HTMLInputElement) => {
                        element.checked = selected.includes(item.value);
                    }),
            );
        }
    }

    /** "Late to complain": blur validates only a field the user changed or that shows an error (DL#53 G2). */
    function handleNativeBlur(field: FormFieldView): void {
        if (dirtyTargets.has(field.target) || errorByTarget()[field.target]) validateField(field);
    }

    /** "Early to forgive": typing clears a shown error once valid, never swaps its text (DL#53 G2). */
    function handleNativeInput(field: FormFieldView, event: Event): void {
        dirtyTargets.add(field.target);
        setFieldValue(field.target, readNativeValue(field, event.target));
        // Also clears a SERVER error: the client cannot re-check it, and the next submit re-asks.
        if (errorByTarget()[field.target] && checkField(field).rule === FieldRule.NONE) {
            clearFieldError(field);
        }
    }

    function handleControl(field: FormFieldView, event: Event): void {
        dirtyTargets.add(field.target);
        const value = readControlValue(event.target);
        setFieldValue(field.target, value);
        reflectToInput(field, value);
        validateField(field);
    }

    /** A chip change is a commit, like `control`: store the new selection and validate. */
    function handleOptionToggle(field: FormFieldView, change: Omit<OptionToggle, 'current'>): void {
        dirtyTargets.add(field.target);
        setFieldValue(
            field.target,
            toggleSelection(field, { current: values()[field.target], ...change }),
        );
        validateField(field);
    }

    wireFieldEvents(refs, carryForward.fields, {
        onNativeInput: handleNativeInput,
        onNativeBlur: handleNativeBlur,
        onControl: handleControl,
        onOptionToggle: handleOptionToggle,
    });
    wireHoneypot(refs, (value) => {
        honeypotValue = value;
    });

    const reactive = useReactive();
    /**
     * Run `work` after the component's pending reactive flush, when a toggled conditional
     * branch has re-mounted and its refs are bound. Inside an event handler the flush ends the
     * batch; after an `await` (a submit's success path) jay schedules it with `setTimeout(0)`,
     * so a bare microtask would run before it (confirmation-focus bug, DL#41 QA 2026-11-10).
     */
    function afterRemount(work: () => void): void {
        void reactive.toBeClean().then(work);
    }
    // Render and mount run synchronously after construction, so this sees bound refs.
    afterRemount(() => wireNativeFormSubmit(refs, submit));
    afterRemount(() => void seedAndReflect().then(captureSelectBaselines));
    afterRemount(() => watchControlValues(refs, carryForward.fields, seedAndReflect));

    /**
     * Refresh the store from the page's `control` values (DL#53 G5) and show each changed
     * visible value in its input. The reflect `exec$` calls are fire-and-forget, as elsewhere.
     */
    async function seedAndReflect(): Promise<void> {
        const changedTargets = await seedControlsIntoStore(
            refs,
            carryForward.fields,
            dirtyTargets,
            setValues,
        );
        for (const field of carryForward.fields) {
            if (!field.hidden && changedTargets.includes(field.target)) {
                reflectToInput(field, values()[field.target]);
            }
        }
    }

    /** Record what each visible single select shows before the user or the browser changes it. */
    async function captureSelectBaselines(): Promise<void> {
        await Promise.all(
            reconcilableFields(carryForward.fields)
                .filter((field) => field.inputType === 'select')
                .map(async (field) => {
                    const domValue = await readBoundInputValue(refs, field);
                    if (domValue !== undefined) selectBaselineByTarget.set(field.target, domValue);
                }),
        );
    }

    /**
     * Autofill guard (DL#53 G2): copy into the store each text-like input whose DOM value differs
     * from the store (or its empty default) and mark it dirty, so the seed then keeps it. A single
     * select is copied only when it also left its baseline. Unbound inputs are skipped.
     */
    async function reconcileNativeInputs(): Promise<void> {
        await Promise.all(
            reconcilableFields(carryForward.fields).map(async (field) => {
                const domValue = await readBoundInputValue(refs, field);
                if (domValue === undefined || !isReconcileNeeded(field, domValue)) return;
                dirtyTargets.add(field.target);
                setFieldValue(field.target, domValue);
            }),
        );
    }

    function isReconcileNeeded(field: FormFieldView, domValue: string): boolean {
        if (
            field.inputType === 'select' &&
            domValue === (selectBaselineByTarget.get(field.target) ?? '')
        ) {
            return false;
        }
        return domValue !== (values()[field.target] ?? emptyValueFor(field));
    }

    function resetForm(): void {
        submitFlight.invalidate();
        setValues(emptyStoreFor(carryForward.fields));
        setErrorByTarget({});
        setInvalidByTarget({});
        setRuleByTarget({});
        setStatusMessage('');
        setSubmitFailure(SubmitFailure.NONE);
        setIsSubmitted(false);
        setIsSubmitting(false);
        dirtyTargets.clear();
        honeypotValue = '';
        clearNativeInputsAfterRemount();
        afterRemount(() => focusFirstFieldInput(refs, carryForward.fields, () => true));
    }

    function showSubmitted(): void {
        setIsSubmitted(true);
        afterRemount(
            () => void refs.confirmation?.exec$((element: HTMLElement) => element.focus()),
        );
    }

    function showFieldErrors(errors: Record<string, string>): void {
        focusFirstFieldInput(refs, carryForward.fields, (field) => Boolean(errors[field.target]));
    }

    /**
     * Clear the native inputs AFTER the form branch has re-mounted (browser-QA reset bug).
     *
     * `setIsSubmitted(false)` re-shows the `<form if="!...isSubmitted">` branch, but the
     * runtime applies that re-mount only when the current reactive batch flushes — which
     * happens synchronously at the END of this event handler, after `resetForm` returns
     * (handlers run inside `batchReactions`). Two runtime facts make a synchronous clear
     * here fail silently: the conditional REUSES the same cached <input> DOM nodes across
     * the toggle (they keep their old `.value`), and while the branch is unmounted its refs
     * are detached — so `reflectToInput`'s `exec$` resolves against an empty ref collection
     * and no-ops, leaving the re-shown inputs pre-filled. Deferring to a microtask runs the
     * clear after the flush has re-mounted the branch and re-bound the refs, so `exec$`
     * reaches the visible input nodes before the browser paints (no flash).
     */
    function clearNativeInputsAfterRemount(): void {
        afterRemount(() => {
            for (const field of carryForward.fields) {
                reflectToInput(field, emptyValueFor(field));
            }
            selectBaselineByTarget.clear();
            void captureSelectBaselines();
            // The re-shown branch may hold a new <form> node; a reused node is a no-op.
            wireNativeFormSubmit(refs, submit);
            // "Send another" carries the page's current hidden values and visible defaults.
            void seedAndReflect();
            // A re-shown branch may hold new control nodes; watched nodes are skipped.
            watchControlValues(refs, carryForward.fields, seedAndReflect);
        });
    }

    refs.resetButton?.onclick(({ event }: { event: Event }) => {
        event.preventDefault();
        resetForm();
    });

    // Inside a <form>, a submit-type button's click becomes the form's `submit` event, which
    // the guard handles — that single path also covers Enter-key implicit submission and
    // `requestSubmit()`. Guarding here too covers a <form> created after the last install
    // point: the native `submit` fires after this click dispatch, so it reaches the listener.
    // The click drives the submit only when no form owns it.
    refs.submitButton?.onclick(({ event }: { event: Event }) => {
        const form = owningSubmitForm(event.target);
        if (form) {
            guardNativeFormSubmit(form, submit);
            return;
        }
        event.preventDefault();
        void submit();
    });

    // A bfcache Back restore must not leave the button disabled by a redirect (DL#42 §4).
    if (typeof window !== 'undefined') {
        window.addEventListener('pageshow', (event: PageTransitionEvent) => {
            if (event.persisted) setIsSubmitting(false);
        });
    }

    async function submit(): Promise<void> {
        if (isSubmitting()) return;
        setStatusMessage('');
        setSubmitFailure(SubmitFailure.NONE);
        setErrorByTarget({});
        setInvalidByTarget({});
        setRuleByTarget({});

        // Honeypot trip: fake success (a bot must not tell), before validation or the API (Q12).
        if (honeypotValue.trim()) {
            showSubmitted();
            reportSubmitOutcome({ outcome: 'succeeded' }); // what the visitor was shown (§5)
            return;
        }

        // The component owns the busy flag and the flight from the first click (DL#53 G2), so a
        // second submit or a reset during the awaits below holds by construction.
        setIsSubmitting(true);
        const generation = submitFlight.begin();
        let isHandedOff = false;
        try {
            // Fixed order: reconcile (what the user sees wins) → seed (the page's value for
            // untouched fields; reflecting keeps the input showing what is posted) → read → validate.
            await reconcileNativeInputs();
            if (!submitFlight.isCurrent(generation)) return;
            await seedAndReflect();
            if (!submitFlight.isCurrent(generation)) return;

            const submissionValues = readFormValues();
            const clientFailures = validateVisibleFields(
                carryForward.fields,
                submissionValues,
                (field, value) => checkField(field, value, submissionValues),
            );
            if (Object.keys(clientFailures).length) {
                showClientErrors(clientFailures);
                return;
            }

            isHandedOff = true;
            await runFormSubmit({
                flight: submitFlight,
                generation,
                setIsSubmitting,
                ensureSessionFresh,
                submitForm,
                formId: carryForward.formId,
                submissionValues,
                presentSubmitResult,
                navigate: (path) => window.location.assign(path),
                onNetworkFailure: () => {
                    setStatusMessage(SUBMIT_FAILED_MESSAGE);
                    setSubmitFailure(SubmitFailure.NETWORK);
                    reportSubmitOutcome({ outcome: 'failed', reason: SubmitFailure.NETWORK });
                },
            });
        } finally {
            // A throw before hand-off must not leave the form busy; a reset already cleared it.
            if (!isHandedOff && submitFlight.isCurrent(generation)) setIsSubmitting(false);
        }
    }

    function showClientErrors(failures: Record<string, FieldCheckResult>): void {
        const targets = Object.keys(failures);
        const errors = Object.fromEntries(
            targets.map((target) => [target, failures[target].message]),
        );
        setErrorByTarget(errors);
        setInvalidByTarget(Object.fromEntries(targets.map((target) => [target, true])));
        setRuleByTarget(
            Object.fromEntries(targets.map((target) => [target, failures[target].rule])),
        );
        showFieldErrors(errors);
        setSubmitFailure(SubmitFailure.VALIDATION);
        reportSubmitOutcome({
            outcome: 'failed',
            reason: SubmitFailure.VALIDATION,
            fieldErrors: errors,
        });
    }

    /** Applies a returned submit result; returns the site path to navigate to, if any. */
    function presentSubmitResult(result: SubmitFormResult): string | undefined {
        if (!result.success) {
            const rejection = presentSubmitRejection(result, carryForward.fields);
            setErrorByTarget(rejection.errorByTarget);
            setInvalidByTarget(rejection.invalidByTarget);
            setRuleByTarget(
                Object.fromEntries(
                    Object.keys(rejection.errorByTarget).map((target) => [
                        target,
                        FieldRule.SERVER,
                    ]),
                ),
            );
            setStatusMessage(rejection.statusMessage);
            setSubmitFailure((result as SubmitRejection).reason ?? SubmitFailure.UNKNOWN);
            showFieldErrors(rejection.errorByTarget);
            reportSubmitRejection(result as SubmitRejection);
            return undefined;
        }
        const redirectTo = (result as { redirectTo?: string }).redirectTo;
        const redirectPath = toSitePath(redirectTo);
        if (redirectTo !== undefined && !redirectPath) {
            console.error('[wix-forms] dropped an unsafe redirectTo', {
                formId: carryForward.formId,
            });
        }
        // A redirect navigates away with the form still busy: no confirmation flash, no focus
        // jump (DL#53 §6). The store is intentionally NOT cleared — the confirmation echoes it (Q2).
        if (!redirectPath) showSubmitted();
        reportSubmitOutcome(
            redirectPath === undefined
                ? { outcome: 'succeeded' }
                : { outcome: 'succeeded', redirectTo: redirectPath },
        );
        return redirectPath;
    }

    function reportSubmitRejection(result: SubmitRejection): void {
        reportSubmitOutcome({
            outcome: 'failed',
            reason: result.reason ?? SubmitFailure.UNKNOWN,
            ...(result.code === undefined ? {} : { code: result.code }),
            ...(result.fieldErrors === undefined ? {} : { fieldErrors: result.fieldErrors }),
        });
    }

    return {
        render: () =>
            buildFormViewState(carryForward.fields, {
                isSubmitting: isSubmitting(),
                statusMessage: statusMessage(),
                loadError: carryForward.loadError ?? '',
                errorByTarget: errorByTarget(),
                invalidByTarget: invalidByTarget(),
                ruleByTarget: ruleByTarget(),
                valueByTarget: values(),
                isSubmitted: isSubmitted(),
                submitFailure: submitFailure(),
            }),
    };
}

interface FieldEventHandlers {
    onNativeInput(field: FormFieldView, event: Event): void;
    onNativeBlur(field: FormFieldView): void;
    onControl(field: FormFieldView, event: Event): void;
    onOptionToggle(field: FormFieldView, change: Omit<OptionToggle, 'current'>): void;
}

/**
 * Wire the native `input` (store + live validation), the `control` channel and, for a
 * multiselect, the per-option `options.toggle` checkboxes per field.
 */
function wireFieldEvents(refs: any, fields: FormFieldView[], handlers: FieldEventHandlers): void {
    for (const field of fields) {
        const fieldRef = refs[contractTagName(field.target)];
        if (!fieldRef) continue;
        fieldRef.input?.oninput(({ event }: { event: Event }) =>
            handlers.onNativeInput(field, event),
        );
        fieldRef.input?.onblur(() => handlers.onNativeBlur(field));
        fieldRef.control?.onclick(({ event }: { event: Event }) =>
            handlers.onControl(field, event),
        );
        fieldRef.control?.oninput(({ event }: { event: Event }) =>
            handlers.onControl(field, event),
        );
        if (field.inputType === 'multiselect') {
            // The option comes from the item's view state, never the DOM (DL#44 §3).
            fieldRef.options?.toggle?.onchange(
                ({ event, viewState }: { event: Event; viewState: { value: string } }) =>
                    handlers.onOptionToggle(field, {
                        optionValue: viewState.value,
                        checked: (event.target as HTMLInputElement).checked,
                    }),
            );
        }
    }
}

/**
 * Focus the first visible field (in form order) that matches and binds a native `input` or a
 * multiselect's `options.toggle` — a chip group focuses its first bound checkbox (DL#44 §3).
 */
function focusFirstFieldInput(
    refs: any,
    fields: FormFieldView[],
    matches: (field: FormFieldView) => boolean,
): void {
    const field = fields.find(
        (candidate) => !candidate.hidden && matches(candidate) && focusableRef(refs, candidate),
    );
    if (!field) return;
    void focusableRef(refs, field).exec$((element: HTMLElement) => element.focus());
}

/**
 * The element ref that takes focus for `field`. A multiselect prefers its first bound chip
 * checkbox: a chip page still has the contract's `input` ref, unbound, and focusing it no-ops.
 * Otherwise (or a `<select multiple>` page) the field's `input`.
 */
function focusableRef(refs: any, field: FormFieldView): any {
    const fieldRef = refs[contractTagName(field.target)];
    if (field.inputType === 'multiselect') {
        // A collection ref has only `map`/`find`; `find` returns a bound item's ref, with `exec$`.
        const firstChip = fieldRef?.options?.toggle?.find(() => true);
        if (firstChip) return firstChip;
    }
    return fieldRef?.input;
}

/** The <form> a click on `target` submits natively, if any (a submit-type button it owns). */
function owningSubmitForm(target: EventTarget | null): HTMLFormElement | undefined {
    const button = (target as Element | null)?.closest?.('button');
    return button?.type === 'submit' ? (button.form ?? undefined) : undefined;
}

/**
 * Guard the submit button's owning <form> (`guardNativeFormSubmit`). Keeping the button
 * `type=submit` preserves Enter-to-submit and autofill/password-manager submit detection.
 * Must run after the refs are bound — in a microtask after construction or after a re-mount —
 * because `exec$` on an unbound ref resolves `undefined`. The guard's WeakSet makes the
 * install points idempotent per <form> node.
 */
function wireNativeFormSubmit(refs: any, submit: () => Promise<void>): void {
    void refs.submitButton?.exec$((button: HTMLButtonElement) =>
        guardNativeFormSubmit(button.form, submit),
    );
}

/**
 * Seed the store from each `control` element's `data-value` — page-provided defaults and
 * hidden fields (Cap 4a, DL#53 G5). Must run after the refs bind: an unbound `exec$` resolves
 * `undefined`, which the pure `seedControlValues` treats as "not bound" and skips. Resolves to
 * the targets whose stored value the seed changed.
 */
function seedControlsIntoStore(
    refs: any,
    fields: FormFieldView[],
    dirtyTargets: Set<string>,
    setValues: (
        updater: (current: Record<string, FieldValue>) => Record<string, FieldValue>,
    ) => void,
): Promise<string[]> {
    const seeds: ControlSeed[] = [];
    const reads = fields.map((field) => {
        const control = refs[contractTagName(field.target)]?.control;
        if (!control?.exec$) return Promise.resolve();
        return control
            .exec$((element: HTMLElement) => readControlValue(element))
            .then((value: string | undefined) => {
                seeds.push({
                    target: field.target,
                    value,
                    dirty: dirtyTargets.has(field.target),
                });
            });
    });
    return Promise.all(reads).then(() => {
        let changedTargets: string[] = [];
        setValues((current) => {
            const seeded = seedControlValues(current, seeds);
            changedTargets = seeded.changedTargets;
            return seeded.store;
        });
        return changedTargets;
    });
}

/** Control elements already observed, so a re-mount that reuses a node adds no second observer. */
const watchedControls = new WeakSet<Element>();

/**
 * Re-seed whenever a bound `control`'s `data-value` changes, so a changed page default shows
 * in its input right away instead of only at submit (DL#53 shown-vs-sent fix, reverses Q6).
 * `seedAndReflect` keeps values the user edited. Must run after the refs bind.
 */
function watchControlValues(
    refs: any,
    fields: FormFieldView[],
    onControlValueChange: () => Promise<void>,
): void {
    if (typeof MutationObserver === 'undefined') return;
    for (const field of fields) {
        void refs[contractTagName(field.target)]?.control?.exec$((element: Element) => {
            if (watchedControls.has(element)) return;
            watchedControls.add(element);
            new MutationObserver(() => void onControlValueChange()).observe(element, {
                attributeFilter: ['data-value'],
            });
        });
    }
}

/** Visible fields whose native input holds one DOM string: text-like kinds and single select. */
function reconcilableFields(fields: FormFieldView[]): FormFieldView[] {
    return fields.filter(
        (field) =>
            !field.hidden && field.inputType !== 'checkbox' && field.inputType !== 'multiselect',
    );
}

/** The bound native input's `.value`, or `undefined` when the page binds no `input` (DL#41 4a). */
function readBoundInputValue(refs: any, field: FormFieldView): Promise<string | undefined> {
    const input = refs[contractTagName(field.target)]?.input;
    if (!input?.exec$) return Promise.resolve(undefined);
    return input.exec$((element: HTMLInputElement | HTMLSelectElement) => element.value);
}

/** Record the honeypot value (Q12) — a dedicated channel that never reaches the store. */
function wireHoneypot(refs: any, record: (value: string) => void): void {
    refs.honeypot?.oninput(({ event }: { event: Event }) => {
        record((event.target as HTMLInputElement).value ?? '');
    });
}

/**
 * Read a native input's value by field kind (DL#41 4c): a checkbox reads `.checked`
 * (boolean), a multiselect reads `.selectedOptions` (string[]), everything else `.value`.
 */
function readNativeValue(field: FormFieldView, target: EventTarget | null): FieldValue {
    if (field.inputType === 'checkbox') {
        return (target as HTMLInputElement | null)?.checked ?? false;
    }
    if (field.inputType === 'multiselect') {
        const select = target as HTMLSelectElement | null;
        return select ? Array.from(select.selectedOptions).map((option) => option.value) : [];
    }
    const element = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    return element?.value ?? '';
}

/** Read a custom-UI element's chosen value from `data-value`, falling back to `.value`. */
function readControlValue(target: EventTarget | null): string {
    const element = target as HTMLElement | null;
    if (!element) return '';
    const dataValue = element.getAttribute?.('data-value');
    if (dataValue !== null && dataValue !== undefined) {
        return dataValue;
    }
    return (element as HTMLInputElement).value ?? '';
}

function describeLoadError(error: unknown): string {
    const rawMessage = error instanceof Error ? error.message : 'Could not load the form.';
    return rawMessage.includes('403')
        ? 'Forms API access denied. Add Wix Forms permission to your API key in the Wix dashboard.'
        : rawMessage || 'Could not load the form. Please try again later.';
}

export const wixForm = makeJayStackComponent<any>()
    .withProps<WixFormProps>()
    .withServices(WIX_FORMS_SERVICE)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(WixFormInteractive);

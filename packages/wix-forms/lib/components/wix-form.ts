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
import { createEffect, createSignal, Props } from '@jay-framework/component';
import { WIX_FORMS_SERVICE, type WixFormsService } from '../services/wix-forms-service-marker.js';
import { ensureSessionFresh } from '@jay-framework/wix-server-client/client';
import type { FieldValue, FormFieldView, SubmitFormResult } from '../types.js';
import { submitForm } from '../actions/forms-actions.js';
import { validateFormField } from '../utils/project-form-fields.js';
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
    const [isSubmitted, setIsSubmitted] = createSignal(false);
    const [submitFailure, setSubmitFailure] = createSignal(SubmitFailure.NONE);
    // The per-field value store — the one source of truth for each field's value (§0).
    const [values, setValues] = createSignal<Record<string, FieldValue>>({});
    // Fields the user has edited; page-provided control seeding never overwrites these.
    const dirtyTargets = new Set<string>();
    // Honeypot value is kept OUT of the store so it never reaches readFormValues (Q12).
    let honeypotValue = '';
    const submitFlight = createSubmitFlight();

    function setFieldValue(target: string, value: FieldValue): void {
        setValues((current) => ({ ...current, [target]: value }));
    }

    /** Submission payload — a synchronous projection of the store, never the DOM (§0). */
    function readFormValues(): Record<string, FieldValue> {
        return projectSubmissionValues(carryForward.fields, values());
    }

    function validateField(field: FormFieldView): void {
        const message = validateFormField(field, values()[field.target] ?? emptyValueFor(field));
        setErrorByTarget((current) => ({ ...current, [field.target]: message }));
        setInvalidByTarget((current) => ({ ...current, [field.target]: Boolean(message) }));
    }

    function clearFieldError(field: FormFieldView): void {
        setErrorByTarget((current) => ({ ...current, [field.target]: '' }));
        setInvalidByTarget((current) => ({ ...current, [field.target]: false }));
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

    function handleNativeInput(field: FormFieldView, event: Event): void {
        dirtyTargets.add(field.target);
        setFieldValue(field.target, readNativeValue(field, event.target));
        clearFieldError(field);
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
        onNativeBlur: validateField,
        onControl: handleControl,
        onOptionToggle: handleOptionToggle,
    });
    wireHoneypot(refs, (value) => {
        honeypotValue = value;
    });

    // This effect runs synchronously during construction, BEFORE render binds the refs, and
    // never re-runs, so its `exec$` sees no elements (DL#44). The seed is kept as a best effort
    // only; the submit-time seed is the guarantee. (Event registration above is safe at
    // construction — listeners are deferred and attached when the element binds.)
    createEffect(() => {
        void seedControlsIntoStore(refs, carryForward.fields, dirtyTargets, setValues);
    });
    // Render and mount run synchronously after construction, so this microtask sees bound refs.
    afterRemount(() => wireNativeFormSubmit(refs, submit));

    function resetForm(): void {
        submitFlight.invalidate();
        setValues(emptyStoreFor(carryForward.fields));
        setErrorByTarget({});
        setInvalidByTarget({});
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
            // The re-shown branch may hold a new <form> node; a reused node is a no-op.
            wireNativeFormSubmit(refs, submit);
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
        // Early exit while a prior submit still seeds/validates; runFormSubmit owns the in-flight guard.
        if (isSubmitting()) return;
        setStatusMessage('');
        setSubmitFailure(SubmitFailure.NONE);
        setErrorByTarget({});

        // Honeypot trip: fake success (a bot must not tell), before validation or the API (Q12).
        if (honeypotValue.trim()) {
            showSubmitted();
            return;
        }

        // Seed page-provided control values (hidden fields) here too: the mount-time seed can
        // run before hydration binds the control elements, so its `exec$` reads nothing. At
        // submit time the elements are bound; seeding never overrides edited or stored values.
        await seedControlsIntoStore(refs, carryForward.fields, dirtyTargets, setValues);

        const submissionValues = readFormValues();
        const clientErrors = validateVisibleFields(carryForward.fields, submissionValues);
        if (Object.keys(clientErrors).length) {
            setErrorByTarget(clientErrors);
            setInvalidByTarget(
                Object.fromEntries(Object.keys(clientErrors).map((target) => [target, true])),
            );
            showFieldErrors(clientErrors);
            setSubmitFailure(SubmitFailure.VALIDATION);
            return;
        }

        await runFormSubmit({
            flight: submitFlight,
            isSubmitting,
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
            },
        });
    }

    /** Applies a returned submit result; returns the site path to navigate to, if any. */
    function presentSubmitResult(result: SubmitFormResult): string | undefined {
        if (!result.success) {
            const rejection = presentSubmitRejection(result, carryForward.fields);
            setErrorByTarget(rejection.errorByTarget);
            setInvalidByTarget(rejection.invalidByTarget);
            setStatusMessage(rejection.statusMessage);
            setSubmitFailure((result as SubmitRejection).reason ?? SubmitFailure.UNKNOWN);
            showFieldErrors(rejection.errorByTarget);
            return undefined;
        }
        // The store is intentionally NOT cleared — the confirmation echoes it (Q2).
        showSubmitted();
        const redirectTo = (result as { redirectTo?: string }).redirectTo;
        const redirectPath = toSitePath(redirectTo);
        if (redirectTo !== undefined && !redirectPath) {
            console.error('[wix-forms] dropped an unsafe redirectTo', {
                formId: carryForward.formId,
            });
        }
        return redirectPath;
    }

    return {
        render: () =>
            buildFormViewState(carryForward.fields, {
                isSubmitting: isSubmitting(),
                statusMessage: statusMessage(),
                loadError: carryForward.loadError ?? '',
                errorByTarget: errorByTarget(),
                invalidByTarget: invalidByTarget(),
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
 * Run `work` after the current reactive batch flushes. Toggling `isSubmitted` re-mounts a
 * conditional branch only at the end of the event handler, and refs inside an unmounted branch
 * are detached (`exec$` no-ops) — see `clearNativeInputsAfterRemount`.
 */
function afterRemount(work: () => void): void {
    queueMicrotask(work);
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
 * hidden fields (Cap 4a, Bug 2). Reads the DOM on mount (a construction-time `exec$` sees
 * no bound element and silently resolves to `undefined`), then applies the pure
 * `seedControlValues` so untouched, non-empty control values reach the submission store
 * before client validation runs. Returns the read/seed promise so callers can await it.
 */
function seedControlsIntoStore(
    refs: any,
    fields: FormFieldView[],
    dirtyTargets: Set<string>,
    setValues: (
        updater: (current: Record<string, FieldValue>) => Record<string, FieldValue>,
    ) => void,
): Promise<void> {
    const seeds: ControlSeed[] = [];
    const reads = fields.map((field) => {
        const control = refs[contractTagName(field.target)]?.control;
        if (!control?.exec$) return Promise.resolve();
        return control
            .exec$((element: HTMLElement) => readControlValue(element))
            .then((value: string | undefined) => {
                seeds.push({
                    target: field.target,
                    value: value ?? '',
                    dirty: dirtyTargets.has(field.target),
                });
            });
    });
    return Promise.all(reads).then(() => {
        setValues((current) => seedControlValues(current, seeds));
    });
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

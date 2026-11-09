/**
 * DOM-free harness that builds `WixFormInteractive` the way jay builds a page (DL#44 Phase 1):
 * refs are created by a `ReferencesManager`, bound to fake elements during render, and joined
 * to their collections only at `element.mount()` — after the interactive constructor has run.
 *
 * A multiselect passed as `chipField` gets a `refs.<field>.options.toggle` collection whose
 * per-option item refs are bound to fake checkboxes (DL#44 Phase 4), as a `forEach` would. Its
 * `input` ref exists, as in every generated contract, but is never bound.
 *
 * Test files must mock `../lib/actions/forms-actions.js` and
 * `@jay-framework/wix-server-client/client` before importing this module.
 */

import { vi } from 'vitest';
import { ConstructContext, defaultEventWrapper, ReferencesManager } from '@jay-framework/runtime';
import { createSignal, makeJayComponent } from '@jay-framework/component';
import { wixForm } from '../../lib/components/wix-form.js';
import { contractTagName } from '../../lib/generators/contract-utils.js';
import type { FormFieldView } from '../../lib/types.js';

export interface FakeForm {
    addEventListener: ReturnType<typeof vi.fn>;
}

export interface FakeButton {
    form: FakeForm | null;
    type: string;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
}

export interface FakeCheckbox {
    checked: boolean;
    focus: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
}

export function fakeCheckbox(): FakeCheckbox {
    return {
        checked: false,
        focus: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
}

export function fakeForm(): FakeForm {
    return { addEventListener: vi.fn() };
}

export function fakeButton(form: FakeForm | null): FakeButton {
    return { form, type: 'submit', addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

/** The last listener `fake.addEventListener` recorded for `type`. */
export function listenerFor(
    fake: { addEventListener: ReturnType<typeof vi.fn> },
    type: string,
): (event: unknown) => unknown {
    const call = [...fake.addEventListener.mock.calls].reverse().find(([name]) => name === type);
    if (!call) throw new Error(`no "${type}" listener was registered`);
    return call[1];
}

export const optionalTextField: FormFieldView = {
    target: 'name',
    label: 'Name',
    inputType: 'text',
    required: false,
    placeholder: '',
    options: [],
};

interface BoundRef {
    set(element: unknown): void;
    mount(): void;
    unmount(): void;
}

export interface WixFormHarness {
    submitForm: FakeForm;
    submitButton: FakeButton;
    resetButton: FakeButton;
    /** The bound submit-button ref, so a test can re-bind it as a re-mount would. */
    submitRef: BoundRef;
    /** One fake checkbox per option of the chip field, in option order. */
    chips: FakeCheckbox[];
}

interface ChipGroup {
    manager: ReferencesManager;
    bind(): BoundRef[];
}

/**
 * `refs.<field>.options.toggle` for a multiselect. jay gives each `forEach` item its own
 * construction context; the harness does what the ref factory does with an item `currData`.
 */
function chipGroup(options: any, field: FormFieldView, chips: FakeCheckbox[]): ChipGroup {
    const [optionsManager] = ReferencesManager.for(options, [], ['toggle'], [], []);
    // Every generated field also has an `input` ref; a chip page never binds it.
    const [manager] = ReferencesManager.for(options, ['input'], [], [], [], {
        options: optionsManager,
    });
    const toggle = optionsManager.get('toggle') as any;
    const bind = () =>
        field.options.map((option, index) => {
            const item = { ...option, selected: false };
            const ref = toggle.mkManagedRef(
                item,
                [field.target, option.value, 'toggle'],
                options?.eventWrapper ?? defaultEventWrapper,
            ) as BoundRef;
            ref.set(chips[index]);
            return ref;
        });
    return { manager, bind };
}

export function mountWixForm(
    fields: FormFieldView[] = [optionalTextField],
    chipField?: FormFieldView,
): WixFormHarness {
    const chips = chipField ? chipField.options.map(() => fakeCheckbox()) : [];
    const submitForm = fakeForm();
    const submitButton = fakeButton(submitForm);
    const resetButton = fakeButton(null);
    let submitRef!: BoundRef;

    const preRender = (options: any) => {
        const group = chipField && chipGroup(options, chipField, chips);
        const children = group ? { [contractTagName(chipField!.target)]: group.manager } : {};
        const [refManager, [submitButtonRef, resetButtonRef]] = ReferencesManager.for(
            options,
            ['submitButton', 'resetButton'],
            [],
            [],
            [],
            children,
        );
        const render = (viewState: any) =>
            ConstructContext.withRootContext(viewState, refManager, () => {
                submitRef = submitButtonRef() as BoundRef;
                submitRef.set(submitButton);
                const resetRef = resetButtonRef() as BoundRef;
                resetRef.set(resetButton);
                const boundRefs = [submitRef, resetRef, ...(group?.bind() ?? [])];
                return {
                    dom: undefined as any,
                    mount: () => boundRefs.forEach((ref) => ref.mount()),
                    update: () => {},
                    unmount: () => boundRefs.forEach((ref) => ref.unmount()),
                };
            });
        return [refManager.getPublicAPI(), render] as const;
    };

    const carryForward = { formId: 'form-1', fields };
    const component = makeJayComponent(preRender as any, (props: any, refs: any) => {
        // makeSignals' shape; signals need the component context, so they are built here.
        const fastViewState = { isSubmitting: createSignal(false) };
        return (wixForm as any).comp(props, refs, fastViewState, carryForward);
    });
    component({} as any);

    return {
        submitForm,
        submitButton,
        resetButton,
        chips,
        get submitRef() {
            return submitRef;
        },
    };
}

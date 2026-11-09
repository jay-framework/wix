/**
 * DOM-free harness that builds `WixFormInteractive` the way jay builds a page (DL#44 Phase 1):
 * refs are created by a `ReferencesManager`, bound to fake elements during render, and joined
 * to their collections only at `element.mount()` — after the interactive constructor has run.
 *
 * Test files must mock `../lib/actions/forms-actions.js` and
 * `@jay-framework/wix-server-client/client` before importing this module.
 */

import { vi } from 'vitest';
import { ConstructContext, ReferencesManager } from '@jay-framework/runtime';
import { createSignal, makeJayComponent } from '@jay-framework/component';
import { wixForm } from '../../lib/components/wix-form.js';
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
}

export function mountWixForm(fields: FormFieldView[] = [optionalTextField]): WixFormHarness {
    const submitForm = fakeForm();
    const submitButton = fakeButton(submitForm);
    const resetButton = fakeButton(null);
    let submitRef!: BoundRef;

    const preRender = (options: any) => {
        const [refManager, [submitButtonRef, resetButtonRef]] = ReferencesManager.for(
            options,
            ['submitButton', 'resetButton'],
            [],
            [],
            [],
        );
        const render = (viewState: any) =>
            ConstructContext.withRootContext(viewState, refManager, () => {
                submitRef = submitButtonRef() as BoundRef;
                submitRef.set(submitButton);
                const resetRef = resetButtonRef() as BoundRef;
                resetRef.set(resetButton);
                return {
                    dom: undefined as any,
                    mount: () => {
                        submitRef.mount();
                        resetRef.mount();
                    },
                    update: () => {},
                    unmount: () => {
                        submitRef.unmount();
                        resetRef.unmount();
                    },
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
        get submitRef() {
            return submitRef;
        },
    };
}

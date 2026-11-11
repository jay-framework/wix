/**
 * DOM-free harness that builds `WixFormInteractive` the way jay builds a page (DL#44 Phase 1):
 * refs are created by a `ReferencesManager`, bound to fake elements during render, and joined
 * to their collections only at `element.mount()` — after the interactive constructor has run.
 *
 * A multiselect passed as `chipField` gets a `refs.<field>.options.toggle` collection whose
 * per-option item refs are bound to fake checkboxes (DL#44 Phase 4), as a `forEach` would. Its
 * `input` ref exists, as in every generated contract, but is never bound.
 *
 * The `confirmation` ref sits inside `if="…isSubmitted"`, as in the guides: it is bound and
 * mounted only when a render `update` first sees `isSubmitted: true`, as jay mounts a
 * conditional branch during the reactive flush.
 *
 * `fieldElements` binds a fake native `input` and/or a fake `control` element per field target
 * (DL#53 P1), so a test can drive a page-owned `data-value` and read what is reflected.
 * `formId` defaults to a non-GUID id; page-check tests (DL#53 P3) pass a real form id.
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

export interface FakeFocusable {
    focus: ReturnType<typeof vi.fn>;
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

/** A fake native input: the component writes `.value` when it reflects a store value. */
export interface FakeInput {
    value: string;
    focus: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
}

/** A fake page-owned `control` element whose `data-value` the page re-renders. */
export interface FakeControl {
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
    getAttribute(name: string): string | null;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
}

export interface FakeFieldElements {
    input?: FakeInput;
    control?: FakeControl;
}

export function fakeInput(): FakeInput {
    return {
        value: '',
        focus: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
}

export function fakeControl(dataValue?: string): FakeControl {
    const attributes = new Map<string, string>();
    if (dataValue !== undefined) attributes.set('data-value', dataValue);
    const control: FakeControl = {
        setAttribute: (name, value) => {
            attributes.set(name, value);
            notifyAttributeObservers(control, name);
        },
        removeAttribute: (name) => {
            attributes.delete(name);
            notifyAttributeObservers(control, name);
        },
        getAttribute: (name) => attributes.get(name) ?? null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    return control;
}

type AttributeObserver = { attributeFilter?: string[]; notify: () => void };
const attributeObserversByTarget = new WeakMap<object, AttributeObserver[]>();

function notifyAttributeObservers(target: object, attributeName: string): void {
    for (const observer of attributeObserversByTarget.get(target) ?? []) {
        if (!observer.attributeFilter || observer.attributeFilter.includes(attributeName)) {
            queueMicrotask(observer.notify);
        }
    }
}

/**
 * A minimal `MutationObserver` for the node test environment: it reports attribute changes
 * made through a fake element's `setAttribute` / `removeAttribute`, asynchronously like the
 * real one. Install with `vi.stubGlobal('MutationObserver', FakeMutationObserver)`.
 */
export class FakeMutationObserver {
    private readonly targets: object[] = [];
    constructor(private readonly callback: (records: unknown[]) => void) {}

    observe(target: object, options: { attributeFilter?: string[] } = {}): void {
        const observers = attributeObserversByTarget.get(target) ?? [];
        observers.push({
            attributeFilter: options.attributeFilter,
            notify: () => this.targets.includes(target) && this.callback([]),
        });
        attributeObserversByTarget.set(target, observers);
        this.targets.push(target);
    }

    disconnect(): void {
        this.targets.length = 0;
    }
}

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
    /** The confirmation element; its ref binds only once `isSubmitted` renders. */
    confirmation: FakeFocusable;
    /** The page's honeypot input, bound to the reserved `honeypot` ref (DL#53 P5). */
    honeypot: FakeInput;
    /** The view state of the latest render or update (DL#53 P2), as the page would see it. */
    viewState(): Record<string, any>;
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

/** `refs.<field>.input` / `.control` for one field, bound to the given fakes during render. */
function fieldGroup(options: any, elements: FakeFieldElements): ChipGroup {
    const [manager, [inputRef, controlRef]] = ReferencesManager.for(
        options,
        ['input', 'control'],
        [],
        [],
        [],
    );
    const bind = () => {
        const bound: BoundRef[] = [];
        if (elements.input) {
            const ref = inputRef() as BoundRef;
            ref.set(elements.input);
            bound.push(ref);
        }
        if (elements.control) {
            const ref = controlRef() as BoundRef;
            ref.set(elements.control);
            bound.push(ref);
        }
        return bound;
    };
    return { manager, bind };
}

export function mountWixForm(
    fields: FormFieldView[] = [optionalTextField],
    chipField?: FormFieldView,
    fieldElements: Record<string, FakeFieldElements> = {},
    formId = 'form-1',
): WixFormHarness {
    const chips = chipField ? chipField.options.map(() => fakeCheckbox()) : [];
    const submitForm = fakeForm();
    const submitButton = fakeButton(submitForm);
    const resetButton = fakeButton(null);
    const confirmation: FakeFocusable = { focus: vi.fn() };
    const honeypot = fakeInput();
    let submitRef!: BoundRef;
    let latestViewState: Record<string, any> = {};

    const preRender = (options: any) => {
        const group = chipField && chipGroup(options, chipField, chips);
        const children: Record<string, ReferencesManager> = group
            ? { [contractTagName(chipField!.target)]: group.manager }
            : {};
        const fieldGroups = Object.entries(fieldElements).map(([target, elements]) => {
            const fieldRefs = fieldGroup(options, elements);
            children[contractTagName(target)] = fieldRefs.manager;
            return fieldRefs;
        });
        const [
            refManager,
            [submitButtonRef, resetButtonRef, confirmationRefFactory, honeypotRefFactory],
        ] = ReferencesManager.for(
            options,
            ['submitButton', 'resetButton', 'confirmation', 'honeypot'],
            [],
            [],
            [],
            children,
        );
        const render = (viewState: any) => {
            latestViewState = viewState;
            return ConstructContext.withRootContext(viewState, refManager, () => {
                submitRef = submitButtonRef() as BoundRef;
                submitRef.set(submitButton);
                const resetRef = resetButtonRef() as BoundRef;
                resetRef.set(resetButton);
                const honeypotRef = honeypotRefFactory() as BoundRef;
                honeypotRef.set(honeypot);
                const confirmationRef = confirmationRefFactory() as BoundRef;
                let isConfirmationMounted = false;
                const boundRefs = [
                    submitRef,
                    resetRef,
                    honeypotRef,
                    ...(group?.bind() ?? []),
                    ...fieldGroups.flatMap((fieldRefs) => fieldRefs.bind()),
                ];
                return {
                    dom: undefined as any,
                    mount: () => boundRefs.forEach((ref) => ref.mount()),
                    update: (next: any) => {
                        latestViewState = next;
                        if (next.isSubmitted && !isConfirmationMounted) {
                            confirmationRef.set(confirmation);
                            confirmationRef.mount();
                            isConfirmationMounted = true;
                        }
                    },
                    unmount: () => boundRefs.forEach((ref) => ref.unmount()),
                };
            });
        };
        return [refManager.getPublicAPI(), render] as const;
    };

    const carryForward = { formId, fields };
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
        confirmation,
        honeypot,
        viewState: () => latestViewState,
        get submitRef() {
            return submitRef;
        },
    };
}

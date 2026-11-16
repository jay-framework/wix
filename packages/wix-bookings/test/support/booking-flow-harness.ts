/**
 * DOM-free harness that builds `BookingFlowInteractive` with fake refs (DL #51 tests 6, 7, 9, 10).
 * Each `render`/`update` stores the latest view state; `formFields.formInputs.map` reads one fake
 * input per rendered field, as jay's collection ref does with `exec$`.
 *
 * Test files must mock `../lib/actions/bookings-actions.js` and
 * `../lib/contracts/booking-flow.jay-contract` before importing this module.
 */

import { createSignal, makeJayComponent } from '@jay-framework/component';
import { bookingFlow } from '../../lib/components/booking-flow.js';
import type { BookingServiceView } from '../../lib/types.js';

export interface FakeInput {
    value: string;
    checked: boolean;
}

interface ContractFormField {
    target: string;
    label: string;
    type: string;
    required: boolean;
}

type ClickHandler = (event: { coordinate: string[] }) => void;

export interface BookingFlowHarness {
    readonly viewState: Record<string, any>;
    /** The fake input behind each rendered field, by target. */
    input(target: string): FakeInput;
    selectService(serviceId: string): void;
    selectSlot(slotId: string): void;
    book(): void;
}

export const QA_SERVICE: BookingServiceView = {
    id: 'svc-1',
    name: 'QA Consultation',
    type: 'APPOINTMENT',
    description: '',
    priceLabel: 'Free',
    durationLabel: '30 min',
    formId: '',
};

/** A few macrotask turns: a click runs reads, validation and the action call in sequence. */
export async function flush(): Promise<void> {
    for (let turn = 0; turn < 3; turn += 1) {
        await new Promise((resolve) => setTimeout(resolve));
    }
}

export function mountBookingFlow(
    services: BookingServiceView[] = [QA_SERVICE],
): BookingFlowHarness {
    const inputs = new Map<string, FakeInput>();
    const clicks: Record<string, ClickHandler> = {};
    let viewState: Record<string, any> = {};

    const input = (target: string): FakeInput => {
        if (!inputs.has(target)) inputs.set(target, { value: '', checked: false });
        return inputs.get(target)!;
    };
    const onclick = (name: string) => ({
        onclick: (handler: ClickHandler) => {
            clicks[name] = handler;
        },
    });
    const refs = {
        services: { serviceButtons: onclick('service') },
        slots: { slotButtons: onclick('slot') },
        formFields: {
            formInputs: {
                map: <T>(read: (ref: unknown, field: ContractFormField) => T): T[] =>
                    (viewState.formFields as ContractFormField[]).map((field) =>
                        read(
                            {
                                exec$: async (fn: (element: FakeInput) => unknown) =>
                                    fn(input(field.target)),
                            },
                            field,
                        ),
                    ),
            },
        },
        bookButton: onclick('book'),
        backButton: onclick('back'),
    };
    const preRender = () => {
        const render = (initial: Record<string, any>) => {
            viewState = initial;
            return {
                dom: undefined,
                mount: () => {},
                update: (next: Record<string, any>) => {
                    viewState = next;
                },
                unmount: () => {},
            };
        };
        return [refs, render] as const;
    };
    const component = makeJayComponent(preRender as any, (props: any, componentRefs: any) => {
        const signals = { services: createSignal(services) };
        return (bookingFlow as any).comp(props, componentRefs, signals, { services });
    });
    component({} as any);

    return {
        get viewState() {
            return viewState;
        },
        input,
        selectService: (serviceId) => clicks.service({ coordinate: [serviceId] }),
        selectSlot: (slotId) => clicks.slot({ coordinate: [slotId] }),
        book: () => clicks.book({ coordinate: [] }),
    };
}

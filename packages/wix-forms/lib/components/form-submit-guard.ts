/**
 * The native <form> submit guard (DL#41 Addendum A, fixed by DL#44 §4).
 *
 * One `submit` listener per <form> node drives the plugin submit for every path — button
 * click, Enter-key implicit submission, `requestSubmit()` — and cancels the browser's GET
 * navigation, which would reload the page before the async submit runs. The WeakSet makes the
 * install points (after construction, after a reset re-mount, from the click) idempotent.
 */

const guardedForms = new WeakSet<HTMLFormElement>();

/** Route the form's native `submit` to the plugin and cancel the page-reloading GET. Idempotent per form. */
export function guardNativeFormSubmit(
    form: HTMLFormElement | null | undefined,
    submit: () => Promise<void>,
): void {
    if (!form || guardedForms.has(form)) return;
    guardedForms.add(form);
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        void submit();
    });
}

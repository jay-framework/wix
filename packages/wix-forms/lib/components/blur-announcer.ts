/**
 * Announces a blur-found field error through the form's `statusMessage` (DL #59).
 *
 * A per-field live region updated in the same moment focus moves is dropped by VoiceOver. Clearing
 * the always-present `role="status"` region now and writing the error one task later is read after
 * the next field's name. The announcer owns the one timer and remembers which field's text is in
 * `statusMessage`, so a fix withdraws only its own text and never a submit's.
 */

/** Deferral of the status write after the clear. 0 = the next macrotask, never synchronous: the
 *  clear-then-deferred-write is what VoiceOver reads after the next field's name (DL #59, Phase 0). */
export const BLUR_ANNOUNCE_DELAY_MS = 0;

export interface BlurAnnouncer {
    /** Clear `statusMessage` now and write `text` after the delay, owned by `target`. */
    announce(target: string, text: string): void;
    /** Drop `target`'s pending or written announcement; a no-op for any other owner. */
    withdraw(target: string): void;
    /**
     * Forget any pending or written announcement without writing. Callers either write
     * `statusMessage` themselves right after, run where it holds no blur text, or tear down.
     */
    cancel(): void;
}

export function createBlurAnnouncer(options: {
    setStatusMessage: (text: string) => void;
    delayMs?: number;
}): BlurAnnouncer {
    const { setStatusMessage, delayMs = BLUR_ANNOUNCE_DELAY_MS } = options;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingTarget: string | undefined;
    let owner: string | undefined;

    function clearPending(): void {
        clearTimeout(pendingTimer);
        pendingTimer = undefined;
        pendingTarget = undefined;
    }

    return {
        announce(target, text) {
            clearPending();
            setStatusMessage('');
            owner = undefined;
            pendingTarget = target;
            pendingTimer = setTimeout(() => {
                pendingTimer = undefined;
                pendingTarget = undefined;
                setStatusMessage(text);
                owner = target;
            }, delayMs);
        },
        withdraw(target) {
            if (pendingTarget === target) clearPending();
            if (owner === target) {
                owner = undefined;
                setStatusMessage('');
            }
        },
        cancel() {
            clearPending();
            owner = undefined;
        },
    };
}

/**
 * Tracks submit attempts so reset (or a newer submit) drops stale in-flight results.
 */

export interface SubmitFlight {
    /** Start a new submit; returns the generation token for this attempt. */
    begin(): number;
    /** Invalidate any in-flight submit (e.g. form reset). */
    invalidate(): void;
    /** True when `generation` is still the active attempt. */
    isCurrent(generation: number): boolean;
}

export function createSubmitFlight(): SubmitFlight {
    let generation = 0;
    return {
        begin(): number {
            return ++generation;
        },
        invalidate(): void {
            generation++;
        },
        isCurrent(generationAtStart: number): boolean {
            return generationAtStart === generation;
        },
    };
}

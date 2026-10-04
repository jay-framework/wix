/** Pure navigation rules shared by slideshow, slider and thumbnail layouts (see design log 33). */
export interface SlideshowState {
    index: number;
    count: number;
    loop: boolean;
}

const clamp = (index: number, count: number) =>
    count <= 0 ? 0 : Math.min(Math.max(index, 0), count - 1);

export function next({ index, count, loop }: SlideshowState): number {
    if (count <= 1) return 0;
    if (index >= count - 1) return loop ? 0 : count - 1;
    return index + 1;
}

export function previous({ index, count, loop }: SlideshowState): number {
    if (count <= 1) return 0;
    if (index <= 0) return loop ? count - 1 : 0;
    return index - 1;
}

export function select(target: number, count: number): number {
    return clamp(target, count);
}

export function hasNext({ index, count, loop }: SlideshowState): boolean {
    return count > 1 && (loop || index < count - 1);
}

export function hasPrevious({ index, count, loop }: SlideshowState): boolean {
    return count > 1 && (loop || index > 0);
}

/** Autoplay keeps running unless it has reached the last item of a non-looping gallery. */
export function shouldKeepPlaying({ index, count, loop }: SlideshowState): boolean {
    return count > 1 && (loop || index < count - 1);
}

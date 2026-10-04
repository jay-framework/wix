import { describe, expect, it } from 'vitest';
import {
    hasNext,
    hasPrevious,
    next,
    previous,
    select,
    shouldKeepPlaying,
} from '../lib/utils/slideshow.js';

describe('slideshow navigation (design log 33 table)', () => {
    it.each`
        index | count | loop     | next | previous | hasNext  | hasPrevious | keepPlaying
        ${0}  | ${4}  | ${false} | ${1} | ${0}     | ${true}  | ${false}    | ${true}
        ${3}  | ${4}  | ${false} | ${3} | ${2}     | ${false} | ${true}     | ${false}
        ${0}  | ${4}  | ${true}  | ${1} | ${3}     | ${true}  | ${true}     | ${true}
        ${3}  | ${4}  | ${true}  | ${0} | ${2}     | ${true}  | ${true}     | ${true}
        ${0}  | ${1}  | ${true}  | ${0} | ${0}     | ${false} | ${false}    | ${false}
        ${0}  | ${0}  | ${true}  | ${0} | ${0}     | ${false} | ${false}    | ${false}
    `('index $index of $count (loop=$loop)', ({ index, count, loop, ...want }) => {
        const state = { index, count, loop };
        expect({
            next: next(state),
            previous: previous(state),
            hasNext: hasNext(state),
            hasPrevious: hasPrevious(state),
            keepPlaying: shouldKeepPlaying(state),
        }).toEqual(want);
    });

    it('clamps selection into range', () => {
        expect([select(-1, 4), select(2, 4), select(9, 4), select(3, 0)]).toEqual([0, 2, 3, 0]);
    });
});

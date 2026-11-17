import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLUR_ANNOUNCE_DELAY_MS, createBlurAnnouncer } from '../lib/components/blur-announcer.js';

/**
 * Bug: a blur-found error written to a per-field live region at the moment focus moves is
 * dropped by VoiceOver (DL #59 §Problem).
 * Expected: the announcer clears statusMessage now and writes the error one task later, owns the
 * text it wrote, and only withdraws its own text.
 */
describe('createBlurAnnouncer (DL #59)', () => {
    let writes: string[];
    const setStatusMessage = (text: string) => void writes.push(text);
    const advance = () => vi.advanceTimersByTimeAsync(BLUR_ANNOUNCE_DELAY_MS);

    beforeEach(() => {
        vi.useFakeTimers();
        writes = [];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should defer the write to the next macrotask, never write synchronously', () => {
        expect(BLUR_ANNOUNCE_DELAY_MS).toBe(0);
    });

    it('should clear now and write the text after the delay', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage });

        announcer.announce('email', 'Enter an email');
        expect(writes).toEqual(['']);

        await advance();
        expect(writes).toEqual(['', 'Enter an email']);
    });

    it('should clear before re-writing the same text', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage });
        announcer.announce('email', 'Enter an email');
        await advance();

        announcer.announce('email', 'Enter an email');
        await advance();

        expect(writes).toEqual(['', 'Enter an email', '', 'Enter an email']);
    });

    it('should write only the last of two pending announcements', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage });

        announcer.announce('email', 'Enter an email');
        announcer.announce('name', 'Enter your name');
        await advance();

        expect(writes).toEqual(['', '', 'Enter your name']);
    });

    it('should cancel a pending write when its field withdraws', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage });

        announcer.announce('email', 'Enter an email');
        announcer.withdraw('email');
        await advance();

        expect(writes).toEqual(['']);
    });

    it('should clear the written text when its owner withdraws', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage });
        announcer.announce('email', 'Enter an email');
        await advance();

        announcer.withdraw('email');

        expect(writes).toEqual(['', 'Enter an email', '']);
    });

    it('should ignore a withdraw from a field that does not own the text', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage });
        announcer.announce('email', 'Enter an email');
        await advance();

        announcer.withdraw('name');
        await advance();

        expect(writes).toEqual(['', 'Enter an email']);
    });

    it('should cancel a pending write without writing and drop ownership', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage });
        announcer.announce('email', 'Enter an email');

        announcer.cancel();
        await advance();
        announcer.withdraw('email');

        expect(writes).toEqual(['']);
    });

    it('should not clear a message written by someone else after cancel', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage });
        announcer.announce('email', 'Enter an email');
        await advance();

        announcer.cancel();
        setStatusMessage('Server says no');
        announcer.withdraw('email');

        expect(writes).toEqual(['', 'Enter an email', 'Server says no']);
    });

    it('should honour a custom delay', async () => {
        const announcer = createBlurAnnouncer({ setStatusMessage, delayMs: 150 });
        announcer.announce('email', 'Enter an email');

        await vi.advanceTimersByTimeAsync(149);
        expect(writes).toEqual(['']);
        await vi.advanceTimersByTimeAsync(1);
        expect(writes).toEqual(['', 'Enter an email']);
    });
});

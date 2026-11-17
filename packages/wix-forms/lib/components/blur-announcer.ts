/** Deferral of the status write after the clear. 0 = the next macrotask, never synchronous: the
 *  clear-then-deferred-write is what VoiceOver reads after the next field's name (DL #59, Phase 0). */
export const BLUR_ANNOUNCE_DELAY_MS = 0;

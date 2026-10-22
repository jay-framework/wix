/**
 * Default freshness applied to this plugin's slow-render responses (Design Log #226).
 *
 * `ttl` — how long, in seconds, the slow data is considered fresh before the production
 * server serves it from storage and refreshes it in the background.
 * `grace` — the absolute age, in seconds, up to which stale data is served immediately
 * while the refresh runs; beyond it the server waits for the refresh.
 */
export const SLOW_RENDER_TTL = 600; // 10 minutes
export const SLOW_RENDER_GRACE = 3600; // 1 hour

/**
 * Freshness for a slow-render *error fallback* (a degraded page rendered when the data
 * fetch failed). Kept short so a transient failure isn't served for long: after this
 * window the server serves the stale fallback once more while refreshing in the
 * background, so the next request recovers. Grace is left to default (no extended
 * stale-serving opinion).
 */
export const SLOW_RENDER_ERROR_TTL = 30; // 30 seconds

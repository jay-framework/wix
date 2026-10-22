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

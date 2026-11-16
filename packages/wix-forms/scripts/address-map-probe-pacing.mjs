// DL #52 L12 pacing for the L-drift probe. Pure: no network, no file access.
//
// Wix accepts about 100 Create Submission probes per anonymous visitor token, and the full run
// needs about 500 (247 countries x 2). So the probe rotates its token, spaces its calls and
// backs off on 429 / 5xx, and it can resume from a progress file after an interruption.

export const PROBES_PER_TOKEN = 90;
export const PROBE_SPACING_MS = 2500;

/** Hands out a token per probe, minting a fresh one every `probesPerToken` probes. */
export function createTokenRotation({ mint, probesPerToken = PROBES_PER_TOKEN }) {
  let token;
  let probesOnToken = 0;
  return {
    async authorizationForNextProbe() {
      if (!token || probesOnToken >= probesPerToken) {
        token = await mint();
        probesOnToken = 0;
      }
      probesOnToken += 1;
      return token;
    },
  };
}

/** Exponential backoff after a 429 / 5xx, from the spacing up to 16 x the spacing. */
export function retryDelayMs(attempt, spacingMs = PROBE_SPACING_MS) {
  return spacingMs * 2 ** Math.min(attempt + 1, 4);
}

/** The countries a resumed run still has to probe, in the original order. */
export function pendingCountries(countries, probedSoFar = {}) {
  return countries.filter((country) => !(country in probedSoFar));
}

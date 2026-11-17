#!/usr/bin/env node
// DL #52 L-drift (live check L12). Dev-only, not shipped.
//
// Re-derives the country -> address template map from public API behaviour and diffs it, and the
// List Form Templates response, against the committed fixtures. Run before every release.
//
//   node scripts/address-map-probe.mjs --client-id <headless client id> --form-id <probe form id> \
//        --target <address field target> <output.json>
//
// The probe form must have ONE all-countries address field whose part overrides
// (validation.fields.<part>.required) are all true. The probe runs as an anonymous visitor: a
// site-admin identity skips required-part validation and its answers say nothing about layouts.
// Every probe must be refused; the script aborts on the first accepted submission.
//
// Pacing (L12): a fresh visitor token every 90 probes (Wix allows about 100 per token), 2.5 s
// between probes, exponential backoff on 429 / 5xx. Progress is saved to <output>.progress.json
// after each country; re-running the same command resumes from it. A finished run removes it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutsByTemplateName, matchSignature, signatureOf } from './address-map-match.mjs';
import {
  createTokenRotation,
  pendingCountries,
  PROBE_SPACING_MS,
  retryDelayMs,
} from './address-map-probe-pacing.mjs';

const API = 'https://www.wixapis.com';
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../test/fixtures/address',
);

const options = parseArguments(process.argv.slice(2));
const mapFixture = readJson('country-template-map.json');
const templatesFixture = readJson('templates-list-response.json');
const countries = readJson('server-allowed-countries.json').countries;

const tokens = createTokenRotation({ mint: () => anonymousVisitorToken(options.clientId) });
const templatesBody = await listTemplates(
  await tokens.authorizationForNextProbe(),
  Object.values(mapFixture.templateIds),
);
const layouts = layoutsByTemplateName(templatesBody, mapFixture.templateIds);

const progressPath = `${options.output}.progress.json`;
const perCountry = fs.existsSync(progressPath)
  ? JSON.parse(fs.readFileSync(progressPath, 'utf8'))
  : {};
const pending = pendingCountries(countries, perCountry);
if (pending.length < countries.length) {
  console.log(`Resuming: ${countries.length - pending.length} countries already probed.`);
}
for (const country of pending) {
  const onlyCountry = await probe({ country });
  const withSubdivision = await probe({ country, subdivision: 'XX' });
  const signature = signatureOf(options.target, onlyCountry, withSubdivision);
  const candidates = matchSignature(signature, layouts);
  perCountry[country] = {
    ...signature,
    template: candidates.length === 1 ? candidates[0] : null,
    candidates,
  };
  fs.writeFileSync(progressPath, JSON.stringify(perCountry));
  process.stdout.write(`${country} `);
}
process.stdout.write('\n');
// A finished run must not be "resumed" by the next release's run.
fs.rmSync(progressPath, { force: true });

const derived = derivedMap(perCountry);
fs.writeFileSync(options.output, JSON.stringify(derived, null, 2) + '\n');
const differences = [
  ...diffMaps(mapFixture, derived),
  ...diffTemplates(templatesFixture, templatesBody),
];
console.log(
  differences.length ? differences.join('\n') : 'No drift: map and templates match the fixtures.',
);
process.exit(differences.length ? 1 : 0);

function parseArguments(argv) {
  const named = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith('--')) named[argv[index].slice(2)] = argv[(index += 1)];
    else positional.push(argv[index]);
  }
  const parsed = {
    clientId: named['client-id'],
    formId: named['form-id'],
    target: named.target,
    output: positional[0],
  };
  if (!parsed.clientId || !parsed.formId || !parsed.target || !parsed.output) {
    console.error(
      'usage: address-map-probe.mjs --client-id <id> --form-id <id> --target <target> <output.json>',
    );
    process.exit(2);
  }
  return parsed;
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

async function anonymousVisitorToken(clientId) {
  const response = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, grantType: 'anonymous' }),
  });
  const body = await response.json();
  if (!body.access_token)
    throw new Error(`could not mint a visitor token (HTTP ${response.status})`);
  return body.access_token;
}

async function listTemplates(authorization, templateIds) {
  const query = templateIds.map((id) => `templateIds=${id}`).join('&');
  const url = `${API}/form-template-service/v2/templates?namespace=wix.form_platform.form&${query}`;
  const response = await fetch(url, { headers: { Authorization: authorization } });
  if (!response.ok) throw new Error(`List Form Templates failed with HTTP ${response.status}`);
  return response.json();
}

/** One Create Submission on the current rotated token; returns the located errors. */
async function probe(address) {
  const body = JSON.stringify({
    submission: { formId: options.formId, submissions: { [options.target]: address } },
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const authorization = await tokens.authorizationForNextProbe();
    const response = await fetch(`${API}/form-submission-service/v4/submissions`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body,
    });
    if (response.status === 429 || response.status >= 500) {
      await sleep(retryDelayMs(attempt));
      continue;
    }
    const parsed = await response.json().catch(() => ({}));
    if (response.ok) {
      console.error(
        `\nABORT: a probe was ACCEPTED (${JSON.stringify(address)}). Delete it from the dashboard; is the probe running as a visitor?`,
      );
      process.exit(3);
    }
    await sleep(PROBE_SPACING_MS);
    return (parsed.details?.validationError?.fieldViolations ?? []).flatMap(
      (violation) => violation.data?.errors ?? [],
    );
  }
  throw new Error(`probe ${JSON.stringify(address)} kept failing with 429 / 5xx`);
}

function derivedMap(results) {
  const countryTemplateIds = {};
  const unmatchedOrAmbiguous = {};
  for (const [country, result] of Object.entries(results)) {
    if (!result.template) {
      unmatchedOrAmbiguous[country] = {
        requiredParts: result.requiredParts,
        subdivision: result.subdivision,
        candidates: result.candidates,
      };
    } else if (result.template !== 'MLA_COMMON') {
      countryTemplateIds[country] = mapFixture.templateIds[result.template];
    }
  }
  const perCountry = Object.fromEntries(
    Object.entries(results).map(([country, { candidates, ...entry }]) => [country, entry]),
  );
  return {
    probedAt: new Date().toISOString(),
    countryTemplateIds,
    unmatchedOrAmbiguous,
    perCountry,
  };
}

function diffMaps(expected, actual) {
  const lines = [];
  for (const country of countries) {
    const before = JSON.stringify(expected.perCountry[country] ?? null);
    const after = JSON.stringify(actual.perCountry[country] ?? null);
    if (before !== after) lines.push(`map ${country}: fixture ${before} -> live ${after}`);
  }
  for (const country of Object.keys(actual.unmatchedOrAmbiguous)) {
    lines.push(`map ${country}: unmatched or ambiguous live`);
  }
  return lines;
}

/** Ignores order and the duplicated entries the API returns. */
function diffTemplates(expected, actual) {
  const uniqueById = (body) => {
    const byId = new Map();
    for (const template of body.templates ?? []) {
      const complete = (template.formFields ?? []).every((field) => field.inputOptions?.target);
      if (complete && !byId.has(template.id)) byId.set(template.id, template.formFields);
    }
    return byId;
  };
  const before = uniqueById(expected);
  const after = uniqueById(actual);
  const lines = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) {
      lines.push(`template ${id}: fields differ from templates-list-response.json`);
    }
  }
  return lines;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

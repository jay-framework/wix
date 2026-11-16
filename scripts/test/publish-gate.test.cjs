/**
 * DL #51 release gate: while RELEASE-BLOCKED.md exists at the repo root, no package publishes
 * from main. Written red first, before the gate file and the check existed.
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLISH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'publish.cjs');
const PUBLISH_WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'publish.yml');
const GATE_FILE = 'RELEASE-BLOCKED.md';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'publish-gate-'));
}

/** A copy of publish.cjs in <root>/scripts, and a fake `yarn` that only leaves a marker file. */
function publishSandbox({ blocked }) {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(PUBLISH_SCRIPT, path.join(root, 'scripts', 'publish.cjs'));
  if (blocked) fs.writeFileSync(path.join(root, GATE_FILE), 'Publishing is blocked (test).\n');
  const binDir = tempDir();
  const marker = path.join(binDir, 'yarn-was-called');
  const fakeYarn = path.join(binDir, 'yarn');
  fs.writeFileSync(fakeYarn, `#!/bin/sh\n: > "${marker}"\n`);
  fs.chmodSync(fakeYarn, 0o755);
  return { root, binDir, marker };
}

/** Runs the copied script from another directory, with the fake `yarn` as the whole PATH. */
function runPublish(sandbox) {
  return spawnSync(
    process.execPath,
    [path.join(sandbox.root, 'scripts', 'publish.cjs'), '123456'],
    {
      cwd: os.tmpdir(),
      env: { PATH: sandbox.binDir },
      encoding: 'utf-8',
      timeout: 20000,
    },
  );
}

test('assertReleaseNotBlocked throws, naming DL #51, when the gate file exists', () => {
  const { assertReleaseNotBlocked } = require(PUBLISH_SCRIPT);
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, GATE_FILE), 'Publishing is blocked (test).\n');
  assert.throws(() => assertReleaseNotBlocked(dir), /DL #51/);
});

test('assertReleaseNotBlocked does not throw without the gate file', () => {
  const { assertReleaseNotBlocked } = require(PUBLISH_SCRIPT);
  assert.doesNotThrow(() => assertReleaseNotBlocked(tempDir()));
});

test('requiring publish.cjs has no side effects (no publish, no OTP prompt)', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const m = require(${JSON.stringify(PUBLISH_SCRIPT)}); console.log(typeof m.assertReleaseNotBlocked)`,
    ],
    { env: { PATH: '' }, encoding: 'utf-8', input: '', timeout: 20000 },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'function\n');
  assert.doesNotMatch(result.stdout, /OTP/);
});

test('publish.cjs exits 1 before calling yarn when the gate file is at its repo root', () => {
  const sandbox = publishSandbox({ blocked: true });
  const result = runPublish(sandbox);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DL #51/);
  assert.equal(fs.existsSync(sandbox.marker), false);
});

test('without the gate file, the same run reaches yarn (the test can see a publish)', () => {
  const sandbox = publishSandbox({ blocked: false });
  runPublish(sandbox);
  assert.equal(fs.existsSync(sandbox.marker), true);
});

test('publish.yml runs the gate check before the "Publish packages" step', () => {
  const workflow = fs.readFileSync(PUBLISH_WORKFLOW, 'utf-8');
  const check = workflow.indexOf('assertReleaseNotBlocked');
  const publish = workflow.indexOf('- name: Publish packages');
  assert.ok(check >= 0, 'no step runs assertReleaseNotBlocked');
  assert.ok(publish >= 0, 'no "Publish packages" step');
  assert.ok(check < publish, 'the gate check runs after "Publish packages"');
});

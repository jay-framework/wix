#!/usr/bin/env node

/**
 * Warms Artifactory cache for scoped npm packages.
 * Generated from node_modules — run before yarn install when cache is cold.
 *
 * Usage:
 *   node scripts/check-urls.mjs                    # warms all known URLs
 *   node scripts/check-urls.mjs urls.txt           # reads URLs from file
 */

const URLS = [
    "https://npm.dev.wixpress.com/@jay-framework%2frollup-plugin",
    "https://npm.dev.wixpress.com/@jay-framework%2fstack-client-runtime",
    "https://npm.dev.wixpress.com/@jay-framework%2fsecure",
    "https://npm.dev.wixpress.com/@jay-framework%2fruntime",
    "https://npm.dev.wixpress.com/@jay-framework%2freactive",
    "https://npm.dev.wixpress.com/@jay-framework%2fgemini-agent-plugin",
    "https://npm.dev.wixpress.com/@jay-framework%2fvite-plugin",
    "https://npm.dev.wixpress.com/@jay-framework%2fcomponent",
    "https://npm.dev.wixpress.com/@jay-framework%2fcompiler-jay-stack",
    "https://npm.dev.wixpress.com/@jay-framework%2fwebmcp-plugin",
    "https://npm.dev.wixpress.com/@jay-framework%2fstack-server-runtime",
    "https://npm.dev.wixpress.com/@jay-framework%2fproduction-server",
    "https://npm.dev.wixpress.com/@jay-framework%2fcompiler-shared",
    "https://npm.dev.wixpress.com/@jay-framework%2fcompiler-jay-html",
    "https://npm.dev.wixpress.com/@jay-framework%2fseo-validator",
    "https://npm.dev.wixpress.com/@jay-framework%2fjay-cli",
    "https://npm.dev.wixpress.com/@jay-framework%2ffullstack-component",
    "https://npm.dev.wixpress.com/@jay-framework%2fa11y-validator",
    "https://npm.dev.wixpress.com/@jay-framework%2fjay-stack-cli",
];

async function checkUrl(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const ms = Date.now() - start;
    return { url, status: res.status, ok: res.ok, ms };
  } catch (err) {
    const ms = Date.now() - start;
    return { url, status: 0, ok: false, ms, error: err.message };
  }
}

async function loadUrls() {
  const arg = process.argv[2];
  if (arg) {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(arg, 'utf-8');
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }
  return URLS;
}

async function main() {
  const urls = await loadUrls();
  console.log(`Warming ${urls.length} URLs...\n`);

  const results = await Promise.all(urls.map(checkUrl));

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  for (const r of failed) {
    const detail = r.error || `HTTP ${r.status}`;
    console.log(`  ❌ ${detail} ${r.url} (${r.ms}ms)`);
  }

  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  if (failed.length > 0) process.exit(1);
}

main();
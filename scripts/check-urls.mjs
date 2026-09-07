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
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/vite-plugin/-/vite-plugin-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/webmcp-plugin/-/webmcp-plugin-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-route-scanner/-/stack-route-scanner-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/view-state-merge/-/view-state-merge-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/secure/-/secure-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-server-build/-/stack-server-build-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/runtime/-/runtime-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler/-/compiler-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/list-compare/-/list-compare-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/ssr-runtime/-/ssr-runtime-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-server-runtime/-/stack-server-runtime-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/plugin-validator/-/plugin-validator-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/production-build/-/production-build-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-client-runtime/-/stack-client-runtime-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/jay-stack-cli/-/jay-stack-cli-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/rollup-plugin/-/rollup-plugin-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/jay-cli/-/jay-cli-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/runtime-automation/-/runtime-automation-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/seo-validator/-/seo-validator-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/a11y-validator/-/a11y-validator-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-analyze-exported-types/-/compiler-analyze-exported-types-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/typescript-bridge/-/typescript-bridge-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/serialization/-/serialization-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/gemini-agent-plugin/-/gemini-agent-plugin-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/reactive/-/reactive-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/json-patch/-/json-patch-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-jay-html/-/compiler-jay-html-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-jay-stack/-/compiler-jay-stack-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/production-server/-/production-server-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/logger/-/logger-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/dev-server/-/dev-server-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/fullstack-component/-/fullstack-component-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-shared/-/compiler-shared-0.24.2.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/component/-/component-0.24.2.tgz',
  'https://npm.dev.wixpress.com/@jay-framework%2fstack-server-build',
  'https://npm.dev.wixpress.com/@jay-framework%2fproduction-build',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/secure/-/secure-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/vite-plugin/-/vite-plugin-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/webmcp-plugin/-/webmcp-plugin-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/serialization/-/serialization-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/logger/-/logger-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/jay-stack-cli/-/jay-stack-cli-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler/-/compiler-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-shared/-/compiler-shared-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/ssr-runtime/-/ssr-runtime-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/view-state-merge/-/view-state-merge-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/seo-validator/-/seo-validator-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/rollup-plugin/-/rollup-plugin-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-server-runtime/-/stack-server-runtime-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/json-patch/-/json-patch-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/list-compare/-/list-compare-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/typescript-bridge/-/typescript-bridge-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-client-runtime/-/stack-client-runtime-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-jay-stack/-/compiler-jay-stack-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-jay-html/-/compiler-jay-html-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/plugin-validator/-/plugin-validator-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/runtime-automation/-/runtime-automation-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/a11y-validator/-/a11y-validator-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/reactive/-/reactive-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-route-scanner/-/stack-route-scanner-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/runtime/-/runtime-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/fullstack-component/-/fullstack-component-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-analyze-exported-types/-/compiler-analyze-exported-types-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/dev-server/-/dev-server-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/component/-/component-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/gemini-agent-plugin/-/gemini-agent-plugin-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/jay-cli/-/jay-cli-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/production-server/-/production-server-0.24.0.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/ssr-runtime/-/ssr-runtime-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/webmcp-plugin/-/webmcp-plugin-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-shared/-/compiler-shared-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/runtime-automation/-/runtime-automation-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/jay-stack-cli/-/jay-stack-cli-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-route-scanner/-/stack-route-scanner-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/logger/-/logger-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/seo-validator/-/seo-validator-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/plugin-validator/-/plugin-validator-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/view-state-merge/-/view-state-merge-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler/-/compiler-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/jay-cli/-/jay-cli-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/reactive/-/reactive-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-server-runtime/-/stack-server-runtime-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/stack-client-runtime/-/stack-client-runtime-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/rollup-plugin/-/rollup-plugin-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/typescript-bridge/-/typescript-bridge-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/vite-plugin/-/vite-plugin-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-jay-html/-/compiler-jay-html-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/gemini-agent-plugin/-/gemini-agent-plugin-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/secure/-/secure-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/serialization/-/serialization-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/dev-server/-/dev-server-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-jay-stack/-/compiler-jay-stack-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/production-server/-/production-server-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/compiler-analyze-exported-types/-/compiler-analyze-exported-types-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/runtime/-/runtime-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/component/-/component-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/a11y-validator/-/a11y-validator-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/json-patch/-/json-patch-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/fullstack-component/-/fullstack-component-0.23.1.tgz',
  'https://npm.dev.wixpress.com/api/npm/npm-repos/@jay-framework/list-compare/-/list-compare-0.23.1.tgz',
  'https://npm.dev.wixpress.com/@jay-framework%2flist-compare',
  'https://npm.dev.wixpress.com/@jay-framework%2fserialization',
  'https://npm.dev.wixpress.com/@jay-framework%2fview-state-merge',
  'https://npm.dev.wixpress.com/@jay-framework%2fcompiler-analyze-exported-types',
  'https://npm.dev.wixpress.com/@jay-framework%2ftypescript-bridge',
  'https://npm.dev.wixpress.com/@jay-framework%2fplugin-validator',
  'https://npm.dev.wixpress.com/@jay-framework%2fstack-route-scanner',
  'https://npm.dev.wixpress.com/@jay-framework%2fssr-runtime',
  'https://npm.dev.wixpress.com/@jay-framework%2fruntime-automation',
  'https://npm.dev.wixpress.com/@jay-framework%2flogger',
  'https://npm.dev.wixpress.com/@jay-framework%2fdev-server',
  'https://npm.dev.wixpress.com/@jay-framework%2fjson-patch',
  'https://npm.dev.wixpress.com/@jay-framework%2frollup-plugin',
  'https://npm.dev.wixpress.com/@jay-framework%2fstack-client-runtime',
  'https://npm.dev.wixpress.com/@jay-framework%2fsecure',
  'https://npm.dev.wixpress.com/@jay-framework%2fruntime',
  'https://npm.dev.wixpress.com/@jay-framework%2freactive',
  'https://npm.dev.wixpress.com/@jay-framework%2fgemini-agent-plugin',
  'https://npm.dev.wixpress.com/@jay-framework%2fvite-plugin',
  'https://npm.dev.wixpress.com/@jay-framework%2fcomponent',
  'https://npm.dev.wixpress.com/@jay-framework%2fcompiler-jay-stack',
  'https://npm.dev.wixpress.com/@jay-framework%2fcompiler',
  'https://npm.dev.wixpress.com/@jay-framework%2fwebmcp-plugin',
  'https://npm.dev.wixpress.com/@jay-framework%2fstack-server-runtime',
  'https://npm.dev.wixpress.com/@jay-framework%2fproduction-server',
  'https://npm.dev.wixpress.com/@jay-framework%2fcompiler-shared',
  'https://npm.dev.wixpress.com/@jay-framework%2fcompiler-jay-html',
  'https://npm.dev.wixpress.com/@jay-framework%2fseo-validator',
  'https://npm.dev.wixpress.com/@jay-framework%2fjay-cli',
  'https://npm.dev.wixpress.com/@jay-framework%2ffullstack-component',
  'https://npm.dev.wixpress.com/@jay-framework%2fa11y-validator',
  'https://npm.dev.wixpress.com/@jay-framework%2fjay-stack-cli',
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

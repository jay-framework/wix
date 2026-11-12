#!/usr/bin/env node
/**
 * DL #56 PoC probe: runs the data-plane calls the Wix plugins make, as three identities —
 * a contributor's Wix user token, the companion app (appStrategy), and a visitor (clientId).
 *
 * Usage (from the repo root):
 *   WIX_TOKEN=$(npx @wix/cli@latest token --site <siteId>) \
 *     node exploration/user-token-auth/probe.mjs examples/store-light
 *
 * Reads appStrategy / oauthStrategy from <project>/config/.wix.yaml. Prints status only, never tokens.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { createClient, AppStrategy, OAuthStrategy } from '@wix/sdk';
import { collections, items } from '@wix/data';
import { currentCart } from '@wix/ecom';

const projectDir = process.argv[2] || 'examples/store-light';
const config = yaml.load(fs.readFileSync(path.join(projectDir, 'config/.wix.yaml'), 'utf8'));
const siteId = config.appStrategy?.siteId;
const token = process.env.WIX_TOKEN;
if (!token) throw new Error('Set WIX_TOKEN to a Wix user access token');

/** Same headers as wix-server-client's userTokenStrategy (lib/server-auth.ts). */
const userTokenAuth = {
  getAuthHeaders: async () => ({
    headers: siteId ? { Authorization: token, 'wix-site-id': siteId } : { Authorization: token },
  }),
};

const identities = {
  userToken: createClient({ auth: userTokenAuth, modules: {} }),
  app: config.appStrategy && createClient({ auth: AppStrategy(config.appStrategy), modules: {} }),
  visitor: createClient({
    auth: OAuthStrategy({ clientId: config.oauthStrategy.clientId }),
    modules: {},
  }),
};

async function rest(client, method, urlPath, body) {
  const { headers } = await client.auth.getAuthHeaders();
  const response = await fetch(`https://www.wixapis.com${urlPath}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 160)}`);
  return JSON.parse(text || '{}');
}

const probes = {
  'token-info (user token)': async () => {
    const info = await rest(identities.visitor, 'POST', '/oauth2/token-info', { token });
    return `subjectType=${info.subjectType} active=${info.active} site=${info.siteId ? 'yes' : 'no'}`;
  },
  'stores: catalog version': async (c) =>
    (await rest(c, 'GET', '/stores/v3/provision/version')).catalogVersion,
  'stores: products search': async (c) =>
    `${(await rest(c, 'POST', '/stores/v3/products/search', { search: {} })).products?.length ?? 0} products`,
  'stores: categories (tree @wix/stores)': async (c) =>
    `${(await rest(c, 'POST', '/categories/v1/categories/query', { query: { cursorPaging: { limit: 100 } }, treeReference: { appNamespace: '@wix/stores' } })).categories?.length ?? 0} categories`,
  'stores: data extension schemas (materialization)': async (c) =>
    `${(await rest(c, 'GET', '/schema-service/v1/schemas?fqdn=wix.stores.catalog.v3.product')).dataExtensionSchemas?.length ?? 0} schemas`,
  'wix-data: list collections (contract generation)': async (c) =>
    `${(await c.use(collections).listDataCollections({})).collections?.length ?? 0} collections`,
  'wix-data: query jay-backend-files (app-created)': async (c) =>
    `${(await c.use(items).query('jay-backend-files').limit(1).find()).totalCount ?? 0} items`,
  'cart: get current cart': async (c) => {
    const cart = await c.use(currentCart).getCurrentCart();
    return `cart ${cart?._id ? 'found' : 'none'}`;
  },
};

const short = (e) =>
  String(e?.message || e)
    .replace(/\s+/g, ' ')
    .slice(0, 140);
console.log(`site ${siteId}\n`);
console.log('| call | userToken | app | visitor |\n| --- | --- | --- | --- |');
for (const [name, probe] of Object.entries(probes)) {
  const cells = [];
  for (const [idName, client] of Object.entries(identities)) {
    if (name.startsWith('token-info') && idName !== 'userToken') {
      cells.push('—');
      continue;
    }
    if (!client) {
      cells.push('n/a');
      continue;
    }
    try {
      cells.push(`✓ ${await probe(client)}`);
    } catch (e) {
      cells.push(`✗ ${short(e)}`);
    }
  }
  console.log(`| ${name} | ${cells.join(' | ')} |`);
}

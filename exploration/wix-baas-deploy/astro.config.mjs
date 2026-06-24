// @ts-check
import { defineConfig } from 'astro/config';
import wixAdapter from '@wix/runtime-fetch-adapter';

export default defineConfig({
  output: 'server',
  ...(process.env.NODE_ENV === 'production' ? { adapter: wixAdapter() } : {}),
});

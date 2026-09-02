import { describe, expect, it } from 'vitest';
import { createWixPagesManifest } from '../lib/wix-pages-manifest.js';

describe('createWixPagesManifest', () => {
    it('lists concrete static and dynamic route instances', () => {
        const pages = createWixPagesManifest({
            routes: [
                {
                    pattern: '',
                    segments: [],
                    instances: [{ params: {} }],
                },
                {
                    pattern: '/about',
                    segments: [{ type: 'static', value: 'about' }],
                    instances: [{ params: {} }],
                },
                {
                    pattern: '/docs/[slug]',
                    segments: [
                        { type: 'static', value: 'docs' },
                        { type: 'param', value: 'slug' },
                    ],
                    instances: [{ params: { slug: 'intro' } }, { params: { slug: 'routing' } }],
                },
            ],
        });

        expect(pages).toEqual([
            { path: '/', static: true },
            { path: '/about', static: true },
            { path: '/docs/intro', static: true },
            { path: '/docs/routing', static: true },
        ]);
    });

    it('omits noindex, dev-only, and unbounded dynamic routes', () => {
        const pages = createWixPagesManifest({
            routes: [
                {
                    pattern: '/private',
                    segments: [{ type: 'static', value: 'private' }],
                    instances: [{ params: {} }],
                    noIndex: true,
                },
                {
                    pattern: '/_jay/debug',
                    segments: [
                        { type: 'static', value: '_jay' },
                        { type: 'static', value: 'debug' },
                    ],
                    instances: [{ params: {} }],
                    devOnly: true,
                },
                {
                    pattern: '/items/[slug]',
                    segments: [
                        { type: 'static', value: 'items' },
                        { type: 'param', value: 'slug' },
                    ],
                    instances: [],
                },
            ],
        });

        expect(pages).toEqual([]);
    });

    it('normalizes optional parameters and removes duplicate paths', () => {
        const pages = createWixPagesManifest({
            routes: [
                {
                    pattern: '/blog/[[slug]]',
                    segments: [
                        { type: 'static', value: 'blog' },
                        { type: 'optional', value: 'slug' },
                    ],
                    instances: [{ params: {} }, { params: { slug: 'news' } }],
                },
                {
                    pattern: '/blog',
                    segments: [{ type: 'static', value: 'blog' }],
                    instances: [],
                },
                {
                    pattern: '/archive/[[...parts]]',
                    segments: [
                        { type: 'static', value: 'archive' },
                        { type: 'optionalCatchAll', value: 'parts' },
                    ],
                    instances: [{ params: { parts: '2026/september' } }],
                },
            ],
        });

        expect(pages).toEqual([
            { path: '/blog', static: true },
            { path: '/blog/news', static: true },
            { path: '/archive/2026/september', static: true },
        ]);
    });
});

import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validate } from '../../lib/validators/media-validator.js';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';

function makeContext(
    html: string,
    contract?: JayHtmlValidationContext['contract'],
    headlessImports?: JayHtmlValidationContext['headlessImports'],
): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: 'test/page.jay-html',
        projectRoot: '/test',
        contract,
        headlessImports: headlessImports ?? [],
    };
}

const mediaContract: JayHtmlValidationContext['contract'] = {
    name: 'product-page',
    tags: [
        {
            tag: 'mainMedia',
            type: [4],
            tags: [
                { tag: 'url', type: [1], meta: { mediaType: 'wix-image' } },
                { tag: 'altText', type: [1] },
            ],
        },
        { tag: 'title', type: [1] },
    ],
};

const headlessImports: JayHtmlValidationContext['headlessImports'] = [
    {
        key: 'productPage',
        contractName: 'product-page',
        contract: {
            name: 'product-page',
            tags: [
                {
                    tag: 'mediaGallery',
                    type: [4],
                    tags: [
                        {
                            tag: 'selectedMedia',
                            type: [4],
                            tags: [
                                { tag: 'url', type: [1], meta: { mediaType: 'wix-image' } },
                                { tag: 'mediaType', type: [2] },
                            ],
                        },
                    ],
                },
                { tag: 'productName', type: [1] },
            ],
        },
    },
];

describe('media-validator', () => {
    describe('Rule A: hardcoded wix URL without optimization', () => {
        it('flags hardcoded wix URL without /v1/ optimization', async () => {
            const ctx = makeContext(
                '<img src="https://static.wixstatic.com/media/abc123" alt="photo" />',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining('optimization parameters'),
                    element: '<img>',
                }),
            ]);
        });

        it('passes hardcoded wix URL with /v1/ optimization', async () => {
            const ctx = makeContext(
                '<img src="https://static.wixstatic.com/media/abc123/v1/fill/w_400,h_300/file.jpg" alt="photo" />',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('Rule B: binding to wix-image tag without optimization', () => {
        it('flags wix-image binding without optimization params in template', async () => {
            const ctx = makeContext('<img src="{mainMedia.url}" alt="product" />', mediaContract);
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining('mainMedia.url'),
                }),
            ]);
        });

        it('passes wix-image binding with optimization params appended', async () => {
            const ctx = makeContext(
                '<img src="{mainMedia.url}/v1/fill/w_400,h_300/file.jpg" alt="product" />',
                mediaContract,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('does not flag binding to non-wix-image tag', async () => {
            const ctx = makeContext(
                '<img src="{mainMedia.altText}" alt="product" />',
                mediaContract,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('flags headless-keyed binding without optimization', async () => {
            const ctx = makeContext(
                '<img src="{productPage.mediaGallery.selectedMedia.url}" alt="product" />',
                undefined,
                headlessImports,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining('productPage.mediaGallery.selectedMedia.url'),
                }),
            ]);
        });

        it('passes headless-keyed binding with optimization appended', async () => {
            const ctx = makeContext(
                '<img src="{productPage.mediaGallery.selectedMedia.url}/v1/fill/w_800,h_600/file.jpg" alt="product" />',
                undefined,
                headlessImports,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('Rule C: local image reference', () => {
        it('flags local image path', async () => {
            const ctx = makeContext('<img src="/images/logo.png" alt="logo" />');
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining('Local image'),
                }),
            ]);
        });

        it('flags local image with various extensions', async () => {
            const ctx = makeContext('<img src="/banner.webp" alt="banner" />');
            const findings = await validate(ctx);
            expect(findings).toHaveLength(1);
        });

        it('flags relative image path without leading slash', async () => {
            const ctx = makeContext('<img src="photo.png" alt="photo" />');
            const findings = await validate(ctx);
            expect(findings).toHaveLength(1);
        });

        it('does not flag non-image local paths', async () => {
            const ctx = makeContext('<a href="/about">About</a>');
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('edge cases', () => {
        it('handles multiple errors in same file', async () => {
            const ctx = makeContext(
                `<div>
                    <img src="https://static.wixstatic.com/media/abc123" alt="a" />
                    <img src="/images/logo.png" alt="b" />
                    <img src="{mainMedia.url}" alt="c" />
                </div>`,
                mediaContract,
            );
            const findings = await validate(ctx);
            expect(findings).toHaveLength(3);
        });

        it('checks video poster attribute', async () => {
            const ctx = makeContext(
                '<video poster="https://static.wixstatic.com/media/vid123" src="video.mp4"></video>',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    message: expect.stringContaining('optimization parameters'),
                }),
            ]);
        });

        it('returns no findings for fully optimized page', async () => {
            const ctx = makeContext(
                `<div>
                    <img src="{mainMedia.url}/v1/fill/w_800,h_600/file.webp" alt="hero" />
                    <img src="https://static.wixstatic.com/media/abc123/v1/fit/w_100,h_100/file.jpg" alt="thumb" />
                    <p>No images here</p>
                </div>`,
                mediaContract,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });
});

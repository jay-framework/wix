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
            const errors = findings.filter((f) => f.severity === 'error');
            expect(errors).toEqual([]);
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
            const errors = findings.filter((f) => f.severity === 'error');
            expect(errors).toEqual([]);
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
            const errors = findings.filter((f) => f.severity === 'error');
            expect(errors).toEqual([]);
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

    describe('Rule D: unencoded commas in srcset URLs', () => {
        it('flags unencoded commas in srcset wix media params', async () => {
            const ctx = makeContext(
                `<img src="{mainMedia.url}/v1/fill/w_400,h_400/file.webp"
                      srcset="{mainMedia.url}/v1/fill/w_300,h_300/file.webp 300w,
                              {mainMedia.url}/v1/fill/w_600,h_600/file.webp 600w"
                      alt="product" />`,
                mediaContract,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        severity: 'error',
                        message: expect.stringContaining('%2C'),
                        attribute: 'srcset',
                    }),
                ]),
            );
        });

        it('passes srcset with encoded commas (%2C)', async () => {
            const ctx = makeContext(
                `<img src="{mainMedia.url}/v1/fill/w_400,h_400/file.webp"
                      srcset="{mainMedia.url}/v1/fill/w_300%2Ch_300/file.webp 300w,
                              {mainMedia.url}/v1/fill/w_600%2Ch_600/file.webp 600w"
                      alt="product" />`,
                mediaContract,
            );
            const findings = await validate(ctx);
            const srcsetFindings = findings.filter((f) => f.attribute === 'srcset');
            expect(srcsetFindings).toEqual([]);
        });

        it('does not flag commas in src attribute (only srcset)', async () => {
            const ctx = makeContext(
                '<img src="{mainMedia.url}/v1/fill/w_400,h_400/file.webp" alt="product" />',
                mediaContract,
            );
            const findings = await validate(ctx);
            const commaFindings = findings.filter((f) => f.message?.includes('%2C'));
            expect(commaFindings).toEqual([]);
        });
    });

    describe('Rule E: missing srcset on responsive images', () => {
        it('flags img with w_800 and no srcset', async () => {
            const ctx = makeContext(
                '<img src="https://static.wixstatic.com/media/abc123/v1/fill/w_800,h_600/file.webp" alt="hero" />',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringContaining('srcset'),
                    attribute: 'src',
                }),
            ]);
        });

        it('flags binding with w_600 and no srcset', async () => {
            const ctx = makeContext(
                '<img src="{mainMedia.url}/v1/fill/w_600,h_400/file.webp" alt="product" />',
                mediaContract,
            );
            const findings = await validate(ctx);
            const srcsetWarnings = findings.filter((f) => f.severity === 'warning');
            expect(srcsetWarnings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringContaining('srcset'),
                }),
            ]);
        });

        it('passes when srcset is present', async () => {
            const ctx = makeContext(
                `<img src="{mainMedia.url}/v1/fill/w_800,h_600/file.webp"
                      srcset="{mainMedia.url}/v1/fill/w_400%2Ch_300/file.webp 400w,
                              {mainMedia.url}/v1/fill/w_800%2Ch_600/file.webp 800w"
                      alt="product" />`,
                mediaContract,
            );
            const findings = await validate(ctx);
            const srcsetWarnings = findings.filter((f) => f.severity === 'warning');
            expect(srcsetWarnings).toEqual([]);
        });

        it('passes when w_ is below threshold', async () => {
            const ctx = makeContext(
                '<img src="https://static.wixstatic.com/media/abc123/v1/fill/w_100,h_100/file.jpg" alt="thumb" />',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });

        it('does not flag video elements', async () => {
            const ctx = makeContext(
                '<video poster="https://static.wixstatic.com/media/abc123/v1/fill/w_800,h_600/file.jpg" src="video.mp4"></video>',
            );
            const findings = await validate(ctx);
            const srcsetWarnings = findings.filter((f) => f.severity === 'warning');
            expect(srcsetWarnings).toEqual([]);
        });

        it('flags at exactly 400px width', async () => {
            const ctx = makeContext(
                '<img src="https://static.wixstatic.com/media/abc123/v1/fill/w_400,h_400/file.webp" alt="card" />',
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringContaining('srcset'),
                }),
            ]);
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
                    <img src="{mainMedia.url}/v1/fill/w_800,h_600/file.webp"
                         srcset="{mainMedia.url}/v1/fill/w_400%2Ch_300/file.webp 400w,
                                 {mainMedia.url}/v1/fill/w_800%2Ch_600/file.webp 800w"
                         alt="hero" />
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

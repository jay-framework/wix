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
        {
            tag: 'thumbnail',
            type: [4],
            tags: [
                { tag: 'url', type: [1], meta: { mediaType: 'wix-image' } },
                { tag: 'width', type: [2] },
                { tag: 'height', type: [2] },
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
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringMatching(/^WIX-MEDIA-NO-DIMENSIONS/),
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
                expect.objectContaining({
                    severity: 'warning',
                    message: expect.stringMatching(/^WIX-MEDIA-NO-DIMENSIONS/),
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
                '<img src="{mainMedia.url}/v1/fill/w_600,h_400/file.webp" width="600" height="400" alt="product" />',
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
                      width="800" height="600" alt="product" />`,
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
            expect(findings).toHaveLength(4);
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
                         width="800" height="600" alt="hero" />
                    <img src="https://static.wixstatic.com/media/abc123/v1/fit/w_100,h_100/file.jpg" alt="thumb" />
                    <p>No images here</p>
                </div>`,
                mediaContract,
            );
            const findings = await validate(ctx);
            expect(findings).toEqual([]);
        });
    });

    describe('Rule F: WIX-MEDIA-NO-DIMENSIONS (Design Log #61)', () => {
        const SRC = '{mainMedia.url}/v1/fill/w_300,h_300/file.webp';
        const noDimensions = (findings: Awaited<ReturnType<typeof validate>>) =>
            findings.filter((f) => f.message?.startsWith('WIX-MEDIA-NO-DIMENSIONS'));

        async function noDimensionsFor(html: string, contract = mediaContract) {
            return noDimensions(await validate(makeContext(html, contract, headlessImports)));
        }

        it('warns on a bound wix image with no reserved space', async () => {
            const findings = await noDimensionsFor(`<img src="${SRC}" alt="p" />`);
            expect(findings).toEqual([
                expect.objectContaining({
                    severity: 'warning',
                    element: '<img>',
                    attribute: 'src',
                    message: expect.stringContaining("'{mainMedia.url}'"),
                }),
            ]);
            expect(findings[0].message).toContain(
                'agent-kit/designer/wix-media.md → Reserve space (CLS)',
            );
            expect(findings[0].suggestion).toContain('width="400" height="300"');
        });

        it('warns on a headless-keyed wix image with no reserved space', async () => {
            const findings = await noDimensionsFor(
                '<img src="{productPage.mediaGallery.selectedMedia.url}/v1/fill/w_300,h_300/f.webp" alt="p" />',
                undefined,
            );
            expect(findings).toHaveLength(1);
        });

        it('warns on a video poster bound to a wix image', async () => {
            const findings = await noDimensionsFor(`<video poster="${SRC}" src="v.mp4"></video>`);
            expect(findings).toEqual([
                expect.objectContaining({ element: '<video>', attribute: 'poster' }),
            ]);
        });

        it.each([
            ['static width and height', `width="300" height="300"`],
            ['bound width and height', `width="{thumbnail.width}" height="{thumbnail.height}"`],
            ['inline aspect-ratio', `style="aspect-ratio:4/3"`],
            ['inline width and height', `style="width:80px;height:80px"`],
            ['case-insensitive inline size', `style="WIDTH:80px;Height:80px"`],
            ['fully bound style', `style="{imgStyle}"`],
            ['partly bound style', `style="width:80px;{extra}"`],
        ])('passes with %s', async (_name, sizing) => {
            expect(await noDimensionsFor(`<img src="${SRC}" ${sizing} alt="p" />`)).toEqual([]);
        });

        it('warns when only width is set', async () => {
            expect(await noDimensionsFor(`<img src="${SRC}" width="300" alt="p" />`)).toHaveLength(
                1,
            );
        });

        it('warns when style only has max-width and height:auto', async () => {
            const html = `<img src="${SRC}" style="max-width:100%;height:auto" alt="p" />`;
            expect(await noDimensionsFor(html)).toHaveLength(1);
        });

        it('gives both the transform error and this warning for an untransformed unsized url', async () => {
            const findings = await validate(
                makeContext('<img src="{mainMedia.url}" alt="p" />', mediaContract),
            );
            expect(findings.map((f) => f.severity).sort()).toEqual(['error', 'warning']);
            expect(noDimensions(findings)).toHaveLength(1);
        });

        it('skips <source> and reads the size from the <img> in a <picture>', async () => {
            const html = `<picture><source srcset="${SRC} 300w" /><img src="${SRC}" width="300" height="300" alt="p" /></picture>`;
            expect(await noDimensionsFor(html)).toEqual([]);
        });

        it('reports one finding naming the first binding when several match', async () => {
            const html =
                '<img src="{thumbnail.url}{mainMedia.url}/v1/fill/w_300,h_300/f.webp" alt="p" />';
            const findings = await noDimensionsFor(html);
            expect(findings).toHaveLength(1);
            expect(findings[0].message).toContain("'{thumbnail.url}'");
        });

        it('ignores static wix urls (jay core owns static images)', async () => {
            const html =
                '<img src="https://static.wixstatic.com/media/a/v1/fill/w_100,h_100/f.jpg" alt="p" />';
            expect(await noDimensionsFor(html)).toEqual([]);
        });

        it('ignores bindings that are not wix images', async () => {
            expect(await noDimensionsFor('<img src="{title}" alt="p" />')).toEqual([]);
        });

        it('is suppressed by wix-media: { allow-unsized-media: true }', async () => {
            const ctx = makeContext(`<img src="${SRC}" alt="p" />`, mediaContract);
            ctx.validationOverrides = { 'wix-media': { 'allow-unsized-media': true } };
            expect(noDimensions(await validate(ctx))).toEqual([]);
        });
    });

    describe('guide paths', () => {
        it('points every message at agent-kit/designer/wix-media.md', async () => {
            const findings = await validate(
                makeContext(
                    `<div>
                        <img src="https://static.wixstatic.com/media/abc123" alt="a" />
                        <img src="/images/logo.png" alt="b" />
                        <img src="{mainMedia.url}" alt="c" />
                        <img src="https://static.wixstatic.com/media/a/v1/fill/w_800,h_600/f.webp" alt="d" />
                        <img src="{mainMedia.url}/v1/fill/w_400,h_400/f.webp" srcset="{mainMedia.url}/v1/fill/w_300,h_300/f.webp 300w" width="1" height="1" alt="e" />
                    </div>`,
                    mediaContract,
                ),
            );
            expect(findings.length).toBeGreaterThanOrEqual(5);
            for (const finding of findings) {
                expect(finding.message).toContain('agent-kit/designer/wix-media.md');
            }
        });
    });
});

/**
 * Catalog HTML (product descriptions) is external input rendered raw through `html-string`.
 * Expected outputs follow the sanitizer settings in Design Log #62.
 */
import { describe, expect, it } from 'vitest';
import { htmlToPlainText, sanitizeCatalogHtml } from '../lib/sanitize-catalog-html';

describe('sanitizeCatalogHtml', () => {
    it('removes onerror from img', () => {
        expect(sanitizeCatalogHtml('<img src="https://x/a.png" onerror=alert(1)>')).toBe(
            '<img src="https://x/a.png" />',
        );
    });

    it('removes uppercase ONERROR', () => {
        expect(sanitizeCatalogHtml('<img src="https://x/a.png" ONERROR=alert(1)>')).toBe(
            '<img src="https://x/a.png" />',
        );
    });

    it('removes svg onload (svg discarded, children kept)', () => {
        expect(sanitizeCatalogHtml('<svg onload=alert(1)><p>a</p></svg>')).toBe('<p>a</p>');
    });

    it('removes script tags', () => {
        expect(sanitizeCatalogHtml('<p>a</p><script>alert(1)</script>')).toBe('<p>a</p>');
    });

    it('removes script inside text', () => {
        expect(sanitizeCatalogHtml('<p>a<script>alert(1)</script>b</p>')).toBe('<p>ab</p>');
    });

    it('removes iframe with its content', () => {
        expect(sanitizeCatalogHtml('<p>a</p><iframe src="https://evil">x</iframe>')).toBe(
            '<p>a</p>',
        );
    });

    it('drops style and class attributes', () => {
        expect(sanitizeCatalogHtml('<p style="color:red" class="x">a</p>')).toBe('<p>a</p>');
    });

    it('drops protocol-relative src', () => {
        expect(sanitizeCatalogHtml('<img src="//evil.com/a.png">')).toBe('<img />');
    });

    it('keeps relative href', () => {
        expect(sanitizeCatalogHtml('<a href="/shoes">x</a>')).toBe('<a href="/shoes">x</a>');
    });

    it('replaces an existing rel with noopener noreferrer when target is set', () => {
        expect(
            sanitizeCatalogHtml('<a href="https://x" target="_blank" rel="nofollow">x</a>'),
        ).toBe('<a href="https://x" target="_blank" rel="noopener noreferrer">x</a>');
    });

    it('adds rel on target', () => {
        expect(sanitizeCatalogHtml('<a href="https://x" target="_blank">x</a>')).toBe(
            '<a href="https://x" target="_blank" rel="noopener noreferrer">x</a>',
        );
    });

    it('keeps rel untouched when there is no target', () => {
        expect(sanitizeCatalogHtml('<a href="https://x" rel="nofollow">x</a>')).toBe(
            '<a href="https://x" rel="nofollow">x</a>',
        );
    });

    it('drops javascript: href', () => {
        expect(sanitizeCatalogHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    });

    it('drops entity-obfuscated scheme', () => {
        expect(sanitizeCatalogHtml('<a href="java&#x09;script:alert(1)">x</a>')).toBe('<a>x</a>');
    });

    it('drops data: img', () => {
        expect(sanitizeCatalogHtml('<img src="data:image/svg+xml,<svg onload=alert(1)>">')).toBe(
            '<img />',
        );
    });

    it('drops javascript: img src and onerror together', () => {
        expect(
            sanitizeCatalogHtml(
                `<p>Nice</p><img src="javascript:alert(1)" onerror="document.title='XSS'">`,
            ),
        ).toBe('<p>Nice</p><img />');
    });

    it('closes malformed tags', () => {
        expect(sanitizeCatalogHtml('<p><strong>Hi')).toBe('<p><strong>Hi</strong></p>');
    });

    it('keeps formatting', () => {
        expect(sanitizeCatalogHtml('<p><strong>Hi</strong></p>')).toBe(
            '<p><strong>Hi</strong></p>',
        );
    });
});

describe('htmlToPlainText', () => {
    it('plain text for SEO', () => {
        expect(htmlToPlainText('<p>Nice <b>shoe</b></p>')).toBe('Nice shoe');
    });

    it('plain text decodes entities, spaces block tags', () => {
        expect(
            htmlToPlainText(
                '<p>Fish &amp; chips</p><p>Size&nbsp;M</p><ul><li>a</li><li>b</li></ul>',
            ),
        ).toBe('Fish & chips Size M a b');
    });

    it('plain text drops script content', () => {
        expect(htmlToPlainText('<p>a</p><script>alert(1)</script>')).toBe('a');
    });
});

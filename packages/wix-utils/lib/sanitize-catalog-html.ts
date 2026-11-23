/**
 * Server-only: sanitizes merchant-authored catalog HTML before it enters an `html-string`
 * ViewState field (Design Log #62). Imported through `@jay-framework/wix-utils/sanitize`
 * from slow-render code only, so `sanitize-html` stays out of client bundles.
 */
import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';

const NON_TEXT_TAGS = [
    'script',
    'style',
    'textarea',
    'option',
    'noscript',
    'iframe',
    'object',
    'embed',
];

const BLOCK_TAGS = ['p', 'br', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'];

const RICH_TEXT_TAGS = [
    ...BLOCK_TAGS,
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'span',
    'a',
    'img',
];

const LINK_REL_WHEN_TARGET = 'noopener noreferrer';

/**
 * A link that opens a new browsing context gets `rel="noopener noreferrer"`.
 * The forced value replaces any merchant `rel` (e.g. `nofollow`) — accepted in DL #62.
 */
const addNoopenerWhenTarget: sanitizeHtml.Transformer = (tagName, attribs) => {
    if (!attribs.target) return { tagName, attribs };
    return { tagName, attribs: { ...attribs, rel: LINK_REL_WHEN_TARGET } };
};

const CATALOG_HTML_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: RICH_TEXT_TAGS,
    allowedAttributes: {
        a: ['href', 'target', 'rel'],
        img: ['src', 'alt', 'width', 'height'],
    },
    allowedSchemes: [],
    allowedSchemesByTag: { a: ['http', 'https', 'mailto'], img: ['http', 'https'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    selfClosing: ['img', 'br'],
    nonTextTags: NON_TEXT_TAGS,
    disallowedTagsMode: 'discard',
    transformTags: { a: addNoopenerWhenTarget },
};

const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: BLOCK_TAGS,
    allowedAttributes: {},
    nonTextTags: NON_TEXT_TAGS,
    disallowedTagsMode: 'discard',
};

/** Rich text safe to bind to an `html-string` tag. */
export function sanitizeCatalogHtml(html: string): string {
    return sanitizeHtml(html, CATALOG_HTML_OPTIONS);
}

/** Plain text (no markup, entities decoded) for values such as the SEO meta description. */
export function htmlToPlainText(html: string): string {
    const blocksOnly = sanitizeHtml(html, PLAIN_TEXT_OPTIONS);
    const spaced = blocksOnly.replace(/<[^>]*>/g, ' ');
    // `\s` also matches U+00A0, so a decoded `&nbsp;` collapses too.
    return decodeHTML(spaced).replace(/\s+/g, ' ').trim();
}

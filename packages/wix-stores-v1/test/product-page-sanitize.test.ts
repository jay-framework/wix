// @vitest-environment node
/**
 * Catalog HTML is external input; Jay renders `html-string` raw (Design Log #62).
 * Expected: the slow render sanitizes description + info-section HTML, and the SEO meta
 * description is plain text.
 */
import { describe, expect, it, vi } from 'vitest';

const { enumOf, PAYLOAD } = vi.hoisted(() => ({
    enumOf: (...names: string[]) => Object.fromEntries(names.map((n, i) => [n, i])),
    PAYLOAD: `<p>Nice</p><img src="javascript:alert(1)" onerror="document.title='XSS'">`,
}));

// vitest does not compile linked sub-contracts; provide the enums product-page.ts reads.
vi.mock('../lib/contracts/product-page.jay-contract', () => ({
    ChoiceType: enumOf('CHOICE_TEXT', 'ONE_COLOR', 'MULTIPLE_COLORS', 'IMAGE'),
    ModifierType: enumOf('TEXT_CHOICES', 'SWATCH_CHOICES', 'FREE_TEXT'),
    OptionRenderType: enumOf('TEXT_CHOICES', 'COLOR_SWATCH_CHOICES'),
    ProductType: enumOf('PHYSICAL', 'DIGITAL'),
    StockStatus: enumOf('OUT_OF_STOCK', 'IN_STOCK'),
}));
vi.mock('../lib/contracts/media.jay-contract', () => ({ MediaType: enumOf('IMAGE', 'VIDEO') }));
vi.mock('../lib/contracts/media-gallery.jay-contract', () => ({
    Selected: enumOf('selected', 'notSelected'),
}));

vi.mock('../lib/wix-apis/index.js', () => ({
    queryProducts: vi.fn(async () => ({
        products: [
            {
                _id: 'p1',
                name: 'Shoe',
                description: PAYLOAD,
                additionalInfoSections: [{ title: 'Care', description: PAYLOAD }],
                productOptions: [],
                variants: [],
                media: { items: [] },
                productType: 'physical',
                stock: { inStock: true },
            },
        ],
    })),
}));

import { productPage } from '../lib/components/product-page';

const wixStores = { wixClient: {} };

async function renderSlow() {
    const result: any = await productPage.slowlyRender({ slug: 'shoe' } as any, wixStores as any);
    expect(result.kind).not.toBe('ClientError');
    return result;
}

describe('product page slow render', () => {
    it('sanitizes product.description and section.description in slow render', async () => {
        const result = await renderSlow();
        expect(result.rendered.description).toBe('<p>Nice</p><img />');
        expect(result.rendered.infoSections[0].plainDescription).toBe('<p>Nice</p><img />');
    });

    it('uses plain text for meta description', async () => {
        const result = await renderSlow();
        const meta = result.headTags.find((t: any) => t.attrs?.name === 'description');
        expect(meta.attrs.content).toBe('Nice');
    });
});

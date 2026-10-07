/**
 * Display text of a catalog price. The API's formattedAmount does not follow the site's regional setting
 * (a ja-JP site gets "¥400"); a Wix storefront formats the amount with Intl in that locale (ja-JP "￥400",
 * de-DE "85,00 €"). With a locale and a currency, format the same way; otherwise, or when Intl rejects
 * them, keep the API's formattedAmount.
 */
export function formatPrice(
    price: { amount?: string; formattedAmount?: string } | undefined,
    currency: string | undefined,
    locale: string | null | undefined,
): string {
    const amount = Number(price?.amount);
    if (locale && currency && price?.amount && Number.isFinite(amount)) {
        try {
            return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
        } catch {
            // Unknown locale or currency code: fall back to the API's text.
        }
    }
    return price?.formattedAmount || '';
}

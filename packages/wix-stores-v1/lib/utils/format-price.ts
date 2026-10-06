/**
 * Display text of a V1 price. The API's formatted text does not follow the site's regional setting (he-IL:
 * "85.00 ₪"); a Wix storefront formats the amount with Intl in that locale ("‏85.00 ‏₪", with direction
 * marks). With a locale and a currency, format the same way; otherwise, or when Intl rejects them, keep the
 * API's text.
 */
export function formatPrice(
    amount: number | undefined,
    currency: string | undefined,
    locale: string | null | undefined,
    formatted: string | undefined,
): string {
    if (locale && currency && typeof amount === 'number' && Number.isFinite(amount)) {
        try {
            return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
        } catch {
            // Unknown locale or currency code: fall back to the API's text.
        }
    }
    return formatted || '';
}

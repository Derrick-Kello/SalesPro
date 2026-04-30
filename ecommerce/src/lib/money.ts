// Currency formatting helpers. All prices come back from the backend as
// numbers in major units (e.g. 49.99 GHS), so we just delegate to Intl.

const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "GHS";

const CURRENCY_LOCALE: Record<string, string> = {
	GHS: "en-GH",
	NGN: "en-NG",
	USD: "en-US",
	KES: "en-KE",
	ZAR: "en-ZA",
	GBP: "en-GB",
	EUR: "en-GB",
	XOF: "fr-CI",
};

export function formatMoney(amount: number, currency = DEFAULT_CURRENCY): string {
	const code = (currency || DEFAULT_CURRENCY).toUpperCase();
	const locale = CURRENCY_LOCALE[code] || "en-GH";
	try {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency: code,
			currencyDisplay: "symbol",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount);
	} catch {
		return `${code} ${amount.toFixed(2)}`;
	}
}

export const STORE_CURRENCY = DEFAULT_CURRENCY;

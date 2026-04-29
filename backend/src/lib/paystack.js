// Paystack REST helpers (initialize + verify). Uses PAYSTACK_SECRET_KEY from env.

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

/** Currencies we convert with ×100 subunits (Paystack kobo / pesewas / cents). */
const TWO_DECIMAL = new Set(["NGN", "GHS", "ZAR", "USD", "KES", "EUR", "GBP"]);
/** Whole-unit currencies on Paystack (amount is already in main units). */
const ZERO_DECIMAL = new Set(["XOF"]);

const SUPPORTED = new Set([...TWO_DECIMAL, ...ZERO_DECIMAL]);

function isConfigured() {
  return Boolean(PAYSTACK_SECRET);
}

function assertSupportedCurrency(currency) {
  const code = (currency || "NGN").toUpperCase();
  if (!SUPPORTED.has(code)) {
    throw new Error(
      `Paystack does not support ${code} in this integration. Use one of: ${[...SUPPORTED].sort().join(", ")}.`
    );
  }
  return code;
}

function toSubunits(amountMajor, currency) {
  const code = assertSupportedCurrency(currency);
  const n = Number(amountMajor);
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid amount");
  if (ZERO_DECIMAL.has(code)) return Math.round(n);
  return Math.round(n * 100);
}

function fromSubunits(subunits, currency) {
  const code = assertSupportedCurrency(currency);
  if (ZERO_DECIMAL.has(code)) return subunits;
  return subunits / 100;
}

async function paystackRequest(path, options = {}) {
  if (!PAYSTACK_SECRET) throw new Error("Paystack is not configured");
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const json = await res.json();
  if (!json.status) {
    throw new Error(json.message || "Paystack request failed");
  }
  return json;
}

async function initializeTransaction({ email, amountMajor, currency, metadata }) {
  const curr = assertSupportedCurrency(currency);
  const amount = toSubunits(amountMajor, curr);
  if (amount < 1) throw new Error("Amount must be at least one subunit");

  const body = { email, amount, currency: curr };
  if (metadata && Object.keys(metadata).length) body.metadata = metadata;

  return paystackRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function verifyTransaction(reference) {
  const encoded = encodeURIComponent(reference);
  const json = await paystackRequest(`/transaction/verify/${encoded}`);
  return json.data;
}

async function verifyPaymentMatches(reference, expectedGrandTotalMajor, currency) {
  const curr = assertSupportedCurrency(currency);
  const data = await verifyTransaction(reference);
  if (data.status !== "success") {
    throw new Error("Paystack transaction was not successful");
  }
  if ((data.currency || "").toUpperCase() !== curr) {
    throw new Error("Paystack transaction currency mismatch");
  }
  const paidMajor = fromSubunits(data.amount, curr);
  const expected = Number(expectedGrandTotalMajor);
  const diff = Math.abs(paidMajor - expected);
  const tol = ZERO_DECIMAL.has(curr) ? 1 : 0.01;
  if (diff > tol) {
    throw new Error("Paystack amount does not match sale total");
  }
  return data;
}

/**
 * Soft verify for polling — returns false if pending, failed, or mismatch (no throw).
 */
async function isPaidAndMatches(reference, expectedGrandTotalMajor, currency) {
  if (!PAYSTACK_SECRET || !reference) return false;
  let data;
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const json = await res.json();
    if (!json.status || !json.data) return false;
    data = json.data;
  } catch {
    return false;
  }
  if (data.status !== "success") return false;
  let curr;
  try {
    curr = assertSupportedCurrency(currency);
  } catch {
    return false;
  }
  if ((data.currency || "").toUpperCase() !== curr) return false;
  const paidMajor = fromSubunits(data.amount, curr);
  const expected = Number(expectedGrandTotalMajor);
  const diff = Math.abs(paidMajor - expected);
  const tol = ZERO_DECIMAL.has(curr) ? 1 : 0.01;
  return diff <= tol;
}

module.exports = {
  isConfigured,
  assertSupportedCurrency,
  toSubunits,
  initializeTransaction,
  verifyPaymentMatches,
  isPaidAndMatches,
  SUPPORTED,
};

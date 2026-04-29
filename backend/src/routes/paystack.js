// Paystack: initialize checkout + poll for phone/QR completion (secret stays on server).

const express = require("express");
const { authenticate } = require("../middleware/auth");
const paystack = require("../lib/paystack");

const router = express.Router();
router.use(authenticate);

/**
 * Normalize + validate email for Paystack (they reject loose/placeholder domains like *.localhost
 * and many “looks OK” strings). Order: customer → PAYSTACK_DEFAULT_EMAIL → unique @ email.com (doc pattern).
 */
function normalizeEmailInput(s) {
  if (s == null) return "";
  if (typeof s !== "string") return "";
  return s
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function isValidPaystackEmail(e) {
  const n = normalizeEmailInput(e);
  if (n.length < 6 || n.length > 254) return false;
  if (n.includes("..")) return false;
  // Practical subset of HTML5 email rules (Paystack is stricter than a single @ check)
  if (
    !/^[a-z0-9][a-z0-9.!#$%&'*+/=?^_`{|}~-]*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
      n
    )
  ) {
    return false;
  }
  const domain = n.slice(n.lastIndexOf("@") + 1);
  if (/^localhost$/i.test(domain) || /\.localhost$/i.test(domain)) return false;
  if (/\.local$/i.test(domain)) return false;
  if (/\.invalid$/i.test(domain)) return false;
  return true;
}

function resolvePaystackEmail(raw, userId) {
  const fromCustomer = normalizeEmailInput(raw);
  if (fromCustomer && isValidPaystackEmail(fromCustomer)) return fromCustomer;

  const fromEnv = normalizeEmailInput(process.env.PAYSTACK_DEFAULT_EMAIL);
  if (fromEnv && isValidPaystackEmail(fromEnv)) return fromEnv;

  const uid = Number.isFinite(Number(userId)) ? Number(userId) : 0;
  return `customer+u${uid}t${Date.now()}@email.com`;
}

router.get("/status", (req, res) => {
  res.json({ enabled: paystack.isConfigured() });
});

router.post("/initialize", async (req, res) => {
  try {
    const { amount, email, currency, metadata } = req.body;
    if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }
    const payEmail = resolvePaystackEmail(email, req.user.id);
    const curr = (currency || "NGN").toUpperCase();
    paystack.assertSupportedCurrency(curr);

    const init = await paystack.initializeTransaction({
      email: payEmail,
      amountMajor: Number(amount),
      currency: curr,
      metadata: metadata || undefined,
    });

    res.json({
      accessCode: init.data.access_code,
      reference: init.data.reference,
      authorizationUrl: init.data.authorization_url,
    });
  } catch (err) {
    console.error("[POST /payments/paystack/initialize]", err.message);
    res.status(400).json({ error: err.message || "Could not start Paystack checkout" });
  }
});

/** Query: reference, amount (major units), currency — for cashier screen polling after QR/customer pays on phone */
router.get("/poll", async (req, res) => {
  try {
    const { reference, amount, currency } = req.query;
    if (!reference || amount == null) {
      return res.status(400).json({ error: "reference and amount are required" });
    }
    const paid = await paystack.isPaidAndMatches(
      String(reference),
      Number(amount),
      (currency || "NGN").toUpperCase()
    );
    res.json({ paid });
  } catch (err) {
    console.error("[GET /payments/paystack/poll]", err.message);
    res.status(500).json({ error: "Poll failed" });
  }
});

module.exports = router;

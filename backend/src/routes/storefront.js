// Public storefront API for the Next.js ecommerce client.
// Mounted under /api/storefront. All routes are unauthenticated and read-only,
// except POST /branch/:slug/orders (which is authenticated implicitly by
// re-verifying the Paystack reference against the secret key on this server)
// and the Paystack init/verify helpers.
//
// Each route is scoped to a branch via the URL slug, derived from Branch.name
// (see utils/storefrontBranches.js). The system never trusts a frontend-supplied
// branchId; it always resolves the branch on this server before reading or
// mutating data.

const express = require("express");
const prisma = require("../prisma/client");
const transactionOptions = require("../prisma/transactionOptions");
const paystack = require("../lib/paystack");
const { slugify, resolveBranchBySlug } = require("../utils/storefrontBranches");
const {
  assertTagSellable,
  decrementTrackedTagQty,
} = require("../utils/tagHelpers");
const { invalidate } = require("../cache");

const router = express.Router();

// Light CORS headers so a public storefront on *.marketplace.gh can hit the API.
router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Storefront-Branch");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  variant: true,
  category: true,
  price: true,
  description: true,
  barcode: true,
  isActive: true,
};

const PRODUCT_INCLUDE = {
  inventory: { select: { quantity: true, lowStockAlert: true } },
  productTags: {
    include: { tag: { select: { id: true, name: true, group: true } } },
  },
};

function mapPublicProduct(p, branchInv) {
  if (!p) return p;
  // Storefront availability is strictly branch-driven:
  // a product is visible to a branch only when it has a branch_inventory row
  // (created via transfer/stock movement into that branch).
  const branchQty = branchInv?.quantity ?? 0;
  const tags = (p.productTags || []).map((pt) => ({
    id: pt.tag.id,
    name: pt.tag.name,
    group: pt.tag.group,
    quantity: pt.quantity,
  }));
  // Group tags by `group` for variant pickers (e.g. "Size", "Color").
  const variantGroups = {};
  for (const t of tags) {
    const key = t.group || "Variant";
    if (!variantGroups[key]) variantGroups[key] = [];
    variantGroups[key].push(t);
  }
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    description: p.description || "",
    barcode: p.barcode,
    inStock: branchQty > 0,
    branchStock: branchQty,
    tags,
    variantGroups,
  };
}

/**
 * Returns a list of branches that the storefront knows about.
 * Useful for an "all stores" landing page or admin tooling.
 */
router.get("/branches", async (_req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, location: true, phone: true },
      orderBy: { name: "asc" },
    });
    res.json(
      branches.map((b) => ({
        id: b.id,
        slug: slugify(b.name),
        name: b.name,
        location: b.location,
        phone: b.phone,
      }))
    );
  } catch (err) {
    console.error("[GET /storefront/branches]", err.message);
    res.status(500).json({ error: "Could not fetch branches" });
  }
});

router.get("/branch/:slug", async (req, res) => {
  try {
    const branch = await resolveBranchBySlug(req.params.slug);
    if (!branch) return res.status(404).json({ error: "Branch not found" });
    res.json({
      id: branch.id,
      slug: slugify(branch.name),
      name: branch.name,
      location: branch.location,
      phone: branch.phone,
    });
  } catch (err) {
    console.error("[GET /storefront/branch/:slug]", err.message);
    res.status(500).json({ error: "Could not fetch branch" });
  }
});

router.get("/branch/:slug/categories", async (req, res) => {
  try {
    const branch = await resolveBranchBySlug(req.params.slug);
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        branchInventory: { some: { branchId: branch.id } },
      },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    res.json(products.map((p) => p.category).filter(Boolean));
  } catch (err) {
    console.error("[GET /storefront/branch/:slug/categories]", err.message);
    res.status(500).json({ error: "Could not fetch categories" });
  }
});

router.get("/branch/:slug/products", async (req, res) => {
  try {
    const branch = await resolveBranchBySlug(req.params.slug);
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const { search, category, limit } = req.query;
    const conditions = [
      { isActive: true },
      {
        // Product must actually exist in this branch's inventory.
        branchInventory: { some: { branchId: branch.id } },
      },
    ];

    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { category: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          {
            productTags: {
              some: { tag: { name: { contains: search, mode: "insensitive" } } },
            },
          },
        ],
      });
    }
    if (category) {
      conditions.push({ category: { equals: category, mode: "insensitive" } });
    }

    const take = Math.min(parseInt(limit, 10) || 60, 200);

    const products = await prisma.product.findMany({
      where: { AND: conditions },
      include: {
        ...PRODUCT_INCLUDE,
        branchInventory: { where: { branchId: branch.id } },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take,
    });

    res.json(products.map((p) => mapPublicProduct(p, p.branchInventory[0])));
  } catch (err) {
    console.error("[GET /storefront/branch/:slug/products]", err.message);
    res.status(500).json({ error: "Could not fetch products" });
  }
});

router.get("/branch/:slug/products/:id", async (req, res) => {
  try {
    const branch = await resolveBranchBySlug(req.params.slug);
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid product id" });
    }
    const product = await prisma.product.findFirst({
      where: {
        id,
        isActive: true,
        branchInventory: { some: { branchId: branch.id } },
      },
      include: {
        ...PRODUCT_INCLUDE,
        branchInventory: { where: { branchId: branch.id } },
      },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(mapPublicProduct(product, product.branchInventory[0]));
  } catch (err) {
    console.error("[GET /storefront/branch/:slug/products/:id]", err.message);
    res.status(500).json({ error: "Could not fetch product" });
  }
});

// Initialize Paystack from the storefront. The secret stays server-side.
router.post("/payments/paystack/initialize", async (req, res) => {
  try {
    if (!paystack.isConfigured()) {
      return res.status(503).json({ error: "Paystack is not configured on the server" });
    }
    const { amount, email, currency, callbackUrl, metadata } = req.body || {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Customer email is required" });
    }
    const curr = (currency || "GHS").toUpperCase();
    paystack.assertSupportedCurrency(curr);

    const init = await paystack.initializeTransaction({
      email: email.trim().toLowerCase(),
      amountMajor: amt,
      currency: curr,
      metadata: {
        ...(metadata || {}),
        source: "storefront",
        callbackUrl: callbackUrl || null,
      },
    });

    res.json({
      reference: init.data.reference,
      accessCode: init.data.access_code,
      authorizationUrl: init.data.authorization_url,
    });
  } catch (err) {
    console.error("[POST /storefront/payments/paystack/initialize]", err.message);
    res.status(400).json({ error: err.message || "Could not start checkout" });
  }
});

router.get("/payments/paystack/verify", async (req, res) => {
  try {
    const { reference, amount, currency } = req.query;
    if (!reference || amount == null) {
      return res.status(400).json({ error: "reference and amount are required" });
    }
    const ok = await paystack.isPaidAndMatches(
      String(reference),
      Number(amount),
      (currency || "GHS").toUpperCase()
    );
    res.json({ paid: ok });
  } catch (err) {
    console.error("[GET /storefront/payments/paystack/verify]", err.message);
    res.status(500).json({ error: "Verification failed" });
  }
});

/**
 * The storefront writes orders through the existing Sale pipeline so that
 * inventory, reports, and the dashboard see web orders the same way as POS sales.
 * We attribute these to a system "STOREFRONT" cashier user that is created on
 * first use. Branch is resolved from the URL slug (never trust the client).
 */
async function ensureStorefrontUser() {
  const username = "__storefront__";
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      username,
      // Random non-loginable secret. The web client never authenticates as this
      // user; it's only used as the FK target for Sale.userId.
      password: `disabled_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      fullName: "Storefront (web)",
      role: "CASHIER",
    },
  });
}

router.post("/branch/:slug/orders", async (req, res) => {
  try {
    const branch = await resolveBranchBySlug(req.params.slug);
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const {
      items,
      customer,
      shipping,
      paystackReference,
      currency,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }
    if (!customer || !customer.name || (!customer.phone && !customer.email)) {
      return res.status(400).json({ error: "Customer name and a phone or email are required" });
    }
    if (!paystackReference) {
      return res.status(400).json({ error: "Paystack reference is required" });
    }
    if (!paystack.isConfigured()) {
      return res.status(503).json({ error: "Paystack is not configured on the server" });
    }

    const productIds = [...new Set(
      items
        .map((i) => parseInt(i.productId, 10))
        .filter((n) => Number.isInteger(n) && n > 0)
    )];
    if (productIds.length === 0) {
      return res.status(400).json({ error: "No valid items in cart" });
    }

    // Re-validate everything against the database (do not trust client prices).
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });
    const allowed = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
        branchInventory: { some: { branchId: branch.id } },
      },
      select: { id: true },
    });
    const allowedSet = new Set(allowed.map((p) => p.id));
    for (const pid of productIds) {
      if (!allowedSet.has(pid)) {
        return res.status(400).json({ error: `Product ${pid} is not available at this branch` });
      }
    }

    const tagAssignments = await prisma.productTag.findMany({
      where: { productId: { in: productIds } },
      include: { tag: { select: { id: true, name: true, group: true } } },
    });
    const assignsByPid = {};
    for (const a of tagAssignments) {
      (assignsByPid[a.productId] ||= []).push(a);
    }
    const branchInventories = await prisma.branchInventory.findMany({
      where: { branchId: branch.id, productId: { in: productIds } },
    });
    const globalInventories = await prisma.inventory.findMany({
      where: { productId: { in: productIds } },
    });

    let totalAmount = 0;
    const saleItemsData = [];

    for (const raw of items) {
      const productId = parseInt(raw.productId, 10);
      const qty = parseInt(raw.quantity, 10);
      const tagId =
        raw.tagId != null && raw.tagId !== "" ? parseInt(raw.tagId, 10) : null;
      const product = products.find((p) => p.id === productId);
      if (!product) {
        return res.status(400).json({ error: `Product ${raw.productId} not found` });
      }
      if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: `Invalid quantity for ${product.name}` });
      }

      const assignments = assignsByPid[productId] || [];
      assertTagSellable(
        assignments,
        Number.isFinite(tagId) ? tagId : null,
        qty,
        product.name
      );

      const branchInv = branchInventories.find((i) => i.productId === productId);
      const haveAtBranch = branchInv ? branchInv.quantity : null;
      if (haveAtBranch == null) {
        const globalInv = globalInventories.find((i) => i.productId === productId);
        const fallback = globalInv?.quantity ?? 0;
        if (fallback < qty) {
          return res.status(400).json({ error: `Not enough stock for ${product.name}` });
        }
      } else if (haveAtBranch < qty) {
        return res.status(400).json({ error: `Not enough stock for ${product.name}` });
      }

      const subtotal = product.price * qty;
      totalAmount += subtotal;
      saleItemsData.push({
        productId,
        tagId: Number.isFinite(tagId) ? tagId : null,
        quantity: qty,
        unitPrice: product.price,
        subtotal,
      });
    }

    const shippingAmount = Math.max(0, parseFloat(shipping) || 0);
    const grandTotal = Math.max(0, totalAmount + shippingAmount);
    const grandTotalRounded = Math.round((grandTotal + Number.EPSILON) * 100) / 100;

    // Server-side payment verification — the client cannot lie about payment.
    const curr = (currency || "GHS").toUpperCase();
    try {
      await paystack.verifyPaymentMatches(paystackReference, grandTotalRounded, curr);
    } catch (e) {
      return res.status(400).json({ error: e.message || "Payment verification failed" });
    }
    const dup = await prisma.payment.findFirst({
      where: { reference: paystackReference, method: "PAYSTACK" },
    });
    if (dup) {
      return res.status(409).json({ error: "This payment was already used for an order" });
    }

    const systemUser = await ensureStorefrontUser();

    let customerRow = null;
    if (customer.phone || customer.email) {
      const where = customer.phone
        ? { phone: customer.phone }
        : { email: String(customer.email).toLowerCase() };
      customerRow = await prisma.customer.findFirst({ where }).catch(() => null);
      if (!customerRow) {
        try {
          customerRow = await prisma.customer.create({
            data: {
              name: customer.name,
              phone: customer.phone || null,
              email: customer.email ? String(customer.email).toLowerCase() : null,
              address: customer.address || null,
            },
          });
        } catch (err) {
          // unique conflict raced — fall back to a fresh lookup
          customerRow = await prisma.customer.findFirst({ where }).catch(() => null);
        }
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          userId: systemUser.id,
          customerId: customerRow?.id ?? null,
          branchId: branch.id,
          totalAmount,
          discount: 0,
          tax: 0,
          shipping: shippingAmount,
          grandTotal: grandTotalRounded,
          status: "COMPLETED",
          saleItems: { create: saleItemsData },
        },
        select: { id: true },
      });

      await tx.payment.create({
        data: {
          saleId: newSale.id,
          method: "PAYSTACK",
          amountPaid: grandTotalRounded,
          change: 0,
          reference: paystackReference,
        },
      });

      // Decrement inventory at the branch, creating the row from the global
      // inventory if needed (mirrors the in-store sales flow).
      for (const item of saleItemsData) {
        const existing = await tx.branchInventory.findUnique({
          where: { branchId_productId: { branchId: branch.id, productId: item.productId } },
        });
        if (!existing) {
          const globalInv = await tx.inventory.findUnique({
            where: { productId: item.productId },
          });
          const startingQty = (globalInv?.quantity ?? 0) - item.quantity;
          await tx.branchInventory.create({
            data: {
              branchId: branch.id,
              productId: item.productId,
              quantity: Math.max(0, startingQty),
            },
          });
        } else {
          await tx.branchInventory.update({
            where: { branchId_productId: { branchId: branch.id, productId: item.productId } },
            data: { quantity: { decrement: item.quantity } },
          });
        }
        if (item.tagId) {
          await decrementTrackedTagQty(tx, item.productId, item.tagId, item.quantity);
        }
      }

      if (customerRow) {
        await tx.customer.update({
          where: { id: customerRow.id },
          data: { loyaltyPoints: { increment: Math.floor(grandTotalRounded) } },
        });
      }

      return newSale;
    }, transactionOptions);

    invalidate("overview-stats");

    res.status(201).json({
      orderId: sale.id,
      branch: { id: branch.id, name: branch.name, slug: slugify(branch.name) },
      grandTotal: grandTotalRounded,
      currency: curr,
      reference: paystackReference,
    });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("[POST /storefront/branch/:slug/orders]", err);
    res.status(500).json({ error: "Order processing failed" });
  }
});

module.exports = router;

// Sales processing - the core of the POS system.
// Handles creating transactions, calculating totals, and saving everything.

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");
const { invalidate } = require("../cache");
const { resolveBranchId } = require("../utils/branchScope");
const paystack = require("../lib/paystack");

const FULL_PAY_TOL = 0.009;

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Augment API JSON with paid/balance (amountPaid = cumulative toward invoice). */
function augmentSaleJson(sale) {
  if (!sale) return sale;
  const paid = sale.payment ? roundMoney(sale.payment.amountPaid) : 0;
  const gt = roundMoney(sale.grandTotal);
  const balanceDue = Math.max(0, roundMoney(gt - paid));
  return { ...sale, paidToDate: paid, balanceDue };
}

const router = express.Router();
router.use(authenticate);

// Get sales - scoped by branch
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, status, mine } = req.query;
    const branchId = resolveBranchId(req);

    const where = {};
    if (status) where.status = status;
    if (mine === "true") where.userId = req.user.id;
    if (branchId) where.branchId = branchId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        user: { select: { fullName: true, username: true } },
        customer: { select: { name: true, phone: true } },
        branch: { select: { name: true } },
        payment: true,
        saleItems: { include: { product: { select: { id: true, name: true, price: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(sales.map(augmentSaleJson));
  } catch (err) {
    console.error("[GET /sales]", err.message);
    res.status(500).json({ error: "Could not fetch sales" });
  }
});

// Get a single sale with all its details
router.get("/:id", async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        user: { select: { fullName: true, username: true } },
        customer: { select: { name: true, phone: true, email: true } },
        branch: { select: { name: true } },
        payment: true,
        saleItems: { include: { product: { select: { id: true, name: true, price: true, category: true, barcode: true } } } },
      },
    });
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    res.json(augmentSaleJson(sale));
  } catch (err) {
    console.error("[GET /sales/:id]", err.message);
    res.status(500).json({ error: "Could not fetch sale" });
  }
});

// Additional payment toward a partial balance (admin only — e.g. record customer payoff)
router.patch("/:id/payment", authorize("ADMIN"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const additional = parseFloat(req.body.additionalAmountPaid);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid sale id" });
  if (Number.isNaN(additional) || additional <= 0) {
    return res.status(400).json({ error: "additionalAmountPaid must be a positive number" });
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!sale || !sale.payment) return res.status(404).json({ error: "Sale or payment not found" });
    if (sale.status !== "PARTIALLY_PAID") {
      return res.status(400).json({ error: "Additional payments apply only to partially paid sales with a remaining balance" });
    }

    const gt = roundMoney(sale.grandTotal);
    let newPaid = roundMoney(sale.payment.amountPaid + additional);
    if (newPaid > gt + FULL_PAY_TOL) newPaid = gt;
    const bal = Math.max(0, roundMoney(gt - newPaid));
    const newStatus = bal <= FULL_PAY_TOL ? "COMPLETED" : "PARTIALLY_PAID";

    await prisma.$transaction([
      prisma.payment.update({
        where: { saleId: id },
        data: { amountPaid: newPaid, change: 0 },
      }),
      prisma.sale.update({ where: { id }, data: { status: newStatus } }),
    ]);

    const updated = await prisma.sale.findUnique({
      where: { id },
      include: {
        saleItems: { include: { product: { select: { id: true, name: true, price: true, category: true, barcode: true } } } },
        user: { select: { fullName: true, username: true } },
        customer: true,
        branch: { select: { name: true } },
        payment: true,
      },
    });
    res.json(augmentSaleJson(updated));
    invalidate("overview-stats");
  } catch (err) {
    console.error("[PATCH /sales/:id/payment]", err.message);
    res.status(500).json({ error: "Could not update payment" });
  }
});

// Process a new sale
router.post("/", async (req, res) => {
  const {
    customerId,
    items,
    discount,
    tax,
    shipping,
    paymentMethod,
    amountPaid: amountPaidRaw,
    paymentReference,
    currency: saleCurrency,
    partialPayment,
    cashTendered: cashTenderedRaw,
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: "Payment method is required" });
  }

  let branchId = req.user.branchId ?? null;
  if (req.user.role === "ADMIN" && req.body.branchId != null) {
    const b = parseInt(req.body.branchId, 10);
    if (!Number.isNaN(b)) branchId = b;
  }
  if (!branchId) {
    return res.status(400).json({ error: "Branch is required. Admins must choose a branch (navbar) before checkout." });
  }

  const partial = Boolean(partialPayment);
  if (partial && paymentMethod === "PAYSTACK") {
    return res.status(400).json({ error: "Paystack does not support partial payment at checkout. Choose full payment or another method." });
  }

  try {
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const branchInventories = await prisma.branchInventory.findMany({
      where: { branchId, productId: { in: productIds } },
    });
    const globalInventories = await prisma.inventory.findMany({
      where: { productId: { in: productIds } },
    });

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return res.status(404).json({ error: `Product ID ${item.productId} not found` });
      }
      let branchInv = branchInventories.find((i) => i.productId === item.productId);
      if (!branchInv) {
        const globalInv = globalInventories.find((i) => i.productId === item.productId);
        const availableQty = globalInv?.quantity ?? 0;
        if (availableQty < item.quantity) {
          return res.status(400).json({ error: `Not enough stock for ${product.name}` });
        }
        branchInv = await prisma.branchInventory.upsert({
          where: { branchId_productId: { branchId, productId: item.productId } },
          update: {},
          create: { branchId, productId: item.productId, quantity: availableQty },
        });
        branchInventories.push(branchInv);
      } else if (branchInv.quantity < item.quantity) {
        return res.status(400).json({ error: `Not enough stock for ${product.name}` });
      }
    }

    let totalAmount = 0;
    const saleItemsData = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        subtotal,
      };
    });

    const discountAmount = parseFloat(discount) || 0;
    const taxAmount = parseFloat(tax) || 0;
    const shippingAmount = parseFloat(shipping) || 0;
    const grandTotal = Math.max(0, totalAmount - discountAmount + taxAmount + shippingAmount);
    const grandTotalVal = roundMoney(grandTotal);

    /** Cumulative credited toward invoice (not physical cash tender unless equal). */
    let creditedTowardSale = grandTotalVal;
    let cashChange = 0;

    if (partial) {
      creditedTowardSale = roundMoney(parseFloat(amountPaidRaw));
      if (Number.isNaN(creditedTowardSale) || creditedTowardSale <= FULL_PAY_TOL) {
        return res.status(400).json({ error: "Enter an amount collected now that is greater than zero" });
      }
      if (creditedTowardSale > grandTotalVal + FULL_PAY_TOL) {
        return res.status(400).json({ error: "Collected amount cannot exceed the sale total" });
      }
      if (paymentMethod === "CASH") {
        const tender = parseFloat(cashTenderedRaw !== undefined && cashTenderedRaw !== null && cashTenderedRaw !== ""
          ? cashTenderedRaw
          : amountPaidRaw);
        if (Number.isNaN(tender) || tender < creditedTowardSale - FULL_PAY_TOL) {
          return res.status(400).json({ error: "Cash received must be at least the amount applied to this sale" });
        }
        cashChange = Math.max(0, roundMoney(tender - creditedTowardSale));
      }
    } else if (paymentMethod === "CASH") {
      const tender = parseFloat(amountPaidRaw);
      if (Number.isNaN(tender) || tender < grandTotalVal - FULL_PAY_TOL) {
        return res.status(400).json({ error: "Amount tendered must cover the full total" });
      }
      creditedTowardSale = grandTotalVal;
      cashChange = Math.max(0, roundMoney(tender - grandTotalVal));
    }

    const balanceRemaining = Math.max(0, roundMoney(grandTotalVal - creditedTowardSale));
    const saleStatus = balanceRemaining <= FULL_PAY_TOL ? "COMPLETED" : "PARTIALLY_PAID";

    if (paymentMethod === "PAYSTACK") {
      if (!paymentReference || !String(paymentReference).trim()) {
        return res.status(400).json({ error: "Paystack payment reference is required" });
      }
      if (!paystack.isConfigured()) {
        return res.status(503).json({ error: "Paystack is not configured on the server" });
      }
      const curr = (saleCurrency || "NGN").toUpperCase();
      try {
        await paystack.verifyPaymentMatches(paymentReference, grandTotalVal, curr);
      } catch (e) {
        return res.status(400).json({ error: e.message || "Paystack verification failed" });
      }
      const dup = await prisma.payment.findFirst({
        where: { reference: paymentReference, method: "PAYSTACK" },
      });
      if (dup) {
        return res.status(400).json({ error: "This Paystack reference was already used for a sale" });
      }
      creditedTowardSale = grandTotalVal;
      cashChange = 0;
    }

    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          userId: req.user.id,
          customerId: customerId ? parseInt(customerId) : null,
          branchId,
          totalAmount,
          discount: discountAmount,
          tax: taxAmount,
          shipping: shippingAmount,
          grandTotal: grandTotalVal,
          status: saleStatus,
          saleItems: { create: saleItemsData },
        },
        select: { id: true },
      });

      await Promise.all([
        tx.payment.create({
          data: {
            saleId: newSale.id,
            method: paymentMethod,
            amountPaid: creditedTowardSale,
            change: cashChange,
            reference: paymentReference,
          },
        }),
        ...items.map(item =>
          tx.branchInventory.update({
            where: { branchId_productId: { branchId, productId: item.productId } },
            data: { quantity: { decrement: item.quantity } },
          })
        ),
        ...(customerId ? [
          tx.customer.update({
            where: { id: parseInt(customerId) },
            data: { loyaltyPoints: { increment: Math.floor(grandTotalVal) } },
          })
        ] : []),
      ]);

      return newSale;
    }, { timeout: 15000 });

    const completeSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: {
        saleItems: { include: { product: { select: { id: true, name: true, price: true, category: true, barcode: true } } } },
        user: { select: { fullName: true, username: true } },
        customer: true,
        branch: { select: { name: true } },
        payment: true,
      },
    });

    res.status(201).json(augmentSaleJson(completeSale));
    invalidate("overview-stats");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sale processing failed" });
  }
});

// Delete many sales in one request (admin only; same rules as DELETE /:id)
router.post("/bulk-delete", authorize("ADMIN"), checkPermission("sales.delete"), async (req, res) => {
  const raw = req.body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty ids array" });
  }
  const ids = [...new Set(raw.map((x) => parseInt(x, 10)))].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    return res.status(400).json({ error: "No valid numeric sale ids" });
  }
  if (ids.length > 500) {
    return res.status(400).json({ error: "Too many ids at once (max 500)" });
  }

  try {
    const sales = await prisma.sale.findMany({
      where: { id: { in: ids } },
      include: { saleItems: true },
    });
    const found = new Set(sales.map((s) => s.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return res.status(404).json({
        error: `Sale(s) not found: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? " …" : ""}`,
      });
    }

    await prisma.$transaction(async (tx) => {
      for (const sale of sales) {
        const id = sale.id;
        if ((sale.status === "COMPLETED" || sale.status === "PARTIALLY_PAID") && sale.branchId) {
          await Promise.all(
            sale.saleItems.map((item) =>
              tx.branchInventory
                .update({
                  where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
                  data: { quantity: { increment: item.quantity } },
                })
                .catch(() => {})
            )
          );
        }
        await tx.payment.deleteMany({ where: { saleId: id } });
        await tx.saleItem.deleteMany({ where: { saleId: id } });
        await tx.sale.delete({ where: { id } });
      }
    }, { timeout: 120000 });

    res.json({ deleted: ids.length, message: `${ids.length} sale(s) deleted` });
    invalidate("overview-stats");
  } catch (err) {
    console.error("[POST /sales/bulk-delete]", err.message);
    res.status(500).json({ error: "Could not delete sales" });
  }
});

// Cancel a sale - only managers and admins can do this
router.put("/:id/cancel", authorize("ADMIN", "MANAGER"), checkPermission("sales.cancel"), async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { saleItems: true },
    });

    if (!sale) return res.status(404).json({ error: "Sale not found" });
    if (sale.status !== "COMPLETED" && sale.status !== "PARTIALLY_PAID") {
      return res.status(400).json({ error: "Only active sales (completed or partially paid) can be cancelled" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id }, data: { status: "CANCELLED" } });

      if (sale.branchId) {
        await Promise.all(
          sale.saleItems.map(item =>
            tx.branchInventory.update({
              where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
              data: { quantity: { increment: item.quantity } },
            })
          )
        );
      }
    }, { timeout: 15000 });

    res.json({ message: "Sale cancelled and stock restored" });
  } catch (err) {
    res.status(500).json({ error: "Could not cancel sale" });
  }
});

// Hard-delete a sale - admin only
router.delete("/:id", authorize("ADMIN"), checkPermission("sales.delete"), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { saleItems: true },
    });
    if (!sale) return res.status(404).json({ error: "Sale not found" });

    await prisma.$transaction(async (tx) => {
      if ((sale.status === "COMPLETED" || sale.status === "PARTIALLY_PAID") && sale.branchId) {
        await Promise.all(
          sale.saleItems.map(item =>
            tx.branchInventory.update({
              where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
              data: { quantity: { increment: item.quantity } },
            }).catch(() => {})
          )
        );
      }
      await tx.payment.deleteMany({ where: { saleId: id } });
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });
    }, { timeout: 15000 });

    res.json({ message: "Sale deleted" });
  } catch (err) {
    console.error("[DELETE /sales/:id]", err.message);
    res.status(500).json({ error: "Could not delete sale" });
  }
});

module.exports = router;

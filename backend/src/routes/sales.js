// Sales processing - the core of the POS system.
// Handles creating transactions, calculating totals, and saving everything.

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");
const { invalidate } = require("../cache");
const { resolveBranchId } = require("../utils/branchScope");
const paystack = require("../lib/paystack");

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
    res.json(sales);
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
    res.json(sale);
  } catch (err) {
    console.error("[GET /sales/:id]", err.message);
    res.status(500).json({ error: "Could not fetch sale" });
  }
});

// Process a new sale
router.post("/", async (req, res) => {
  const { customerId, items, discount, tax, shipping, paymentMethod, amountPaid, paymentReference, currency: saleCurrency } = req.body;

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

  try {
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    // Check branch inventory first, fall back to global inventory
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
    const grandTotal = totalAmount - discountAmount + taxAmount + shippingAmount;
    const change = (parseFloat(amountPaid) || 0) - grandTotal;

    if (paymentMethod === "PAYSTACK") {
      if (!paymentReference || !String(paymentReference).trim()) {
        return res.status(400).json({ error: "Paystack payment reference is required" });
      }
      if (!paystack.isConfigured()) {
        return res.status(503).json({ error: "Paystack is not configured on the server" });
      }
      const curr = (saleCurrency || "NGN").toUpperCase();
      try {
        await paystack.verifyPaymentMatches(paymentReference, grandTotal, curr);
      } catch (e) {
        return res.status(400).json({ error: e.message || "Paystack verification failed" });
      }
      const dup = await prisma.payment.findFirst({
        where: { reference: paymentReference, method: "PAYSTACK" },
      });
      if (dup) {
        return res.status(400).json({ error: "This Paystack reference was already used for a sale" });
      }
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
          grandTotal,
          status: "COMPLETED",
          saleItems: { create: saleItemsData },
        },
        select: { id: true },
      });

      await Promise.all([
        tx.payment.create({
          data: {
            saleId: newSale.id,
            method: paymentMethod,
            amountPaid: parseFloat(amountPaid) || grandTotal,
            change: change > 0 ? change : 0,
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
            data: { loyaltyPoints: { increment: Math.floor(grandTotal) } },
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

    res.status(201).json(completeSale);
    invalidate("overview-stats");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sale processing failed" });
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
    if (sale.status !== "COMPLETED") {
      return res.status(400).json({ error: "Only completed sales can be cancelled" });
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
      if (sale.status === "COMPLETED" && sale.branchId) {
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

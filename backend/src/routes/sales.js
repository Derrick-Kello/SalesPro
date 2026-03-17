// Sales processing - the core of the POS system.
// Handles creating transactions, calculating totals, and saving everything.

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

// Get sales - admins and managers see all, cashiers can see all sales too
// but can also filter to just their own using ?mine=true
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, status, mine } = req.query;

    const where = {};
    if (status) where.status = status;

    // When a cashier passes ?mine=true they only see their own sales
    if (mine === "true") {
      where.userId = req.user.id;
    }

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
        payment: true,
        saleItems: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch sales" });
  }
});

// Get a single sale with all its details - used for receipt printing
router.get("/:id", async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        user: { select: { fullName: true, username: true } },
        customer: { select: { name: true, phone: true, email: true } },
        payment: true,
        saleItems: { include: { product: true } },
      },
    });
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch sale" });
  }
});

// Process a new sale - cashiers only, admins and managers don't operate the register
router.post("/", authorize("CASHIER"), async (req, res) => {
  const { customerId, items, discount, tax, paymentMethod, amountPaid, paymentReference } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: "Payment method is required" });
  }

  try {
    // Fetch all products in the cart to get their current prices
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { inventory: true },
    });

    // Make sure every product exists and has enough stock
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return res.status(404).json({ error: `Product ID ${item.productId} not found` });
      }
      if (!product.inventory || product.inventory.quantity < item.quantity) {
        return res.status(400).json({ error: `Not enough stock for ${product.name}` });
      }
    }

    // Calculate the totals
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
    const grandTotal = totalAmount - discountAmount + taxAmount;
    const change = (parseFloat(amountPaid) || 0) - grandTotal;

    // Run everything in a transaction so if anything fails, nothing gets saved
    const sale = await prisma.$transaction(async (tx) => {
      // Create the sale record
      const newSale = await tx.sale.create({
        data: {
          userId: req.user.id,
          customerId: customerId ? parseInt(customerId) : null,
          totalAmount,
          discount: discountAmount,
          tax: taxAmount,
          grandTotal,
          status: "COMPLETED",
          saleItems: { create: saleItemsData },
        },
        include: {
          saleItems: { include: { product: true } },
          user: { select: { fullName: true } },
          customer: true,
        },
      });

      // Record the payment
      await tx.payment.create({
        data: {
          saleId: newSale.id,
          method: paymentMethod,
          amountPaid: parseFloat(amountPaid) || grandTotal,
          change: change > 0 ? change : 0,
          reference: paymentReference,
        },
      });

      // Deduct stock for each item sold
      for (const item of items) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      // Add loyalty points to the customer if one was selected (1 point per dollar)
      if (customerId) {
        await tx.customer.update({
          where: { id: parseInt(customerId) },
          data: { loyaltyPoints: { increment: Math.floor(grandTotal) } },
        });
      }

      return newSale;
    });

    // Fetch the complete sale with payment info to return
    const completeSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: {
        saleItems: { include: { product: true } },
        user: { select: { fullName: true, username: true } },
        customer: true,
        payment: true,
      },
    });

    res.status(201).json(completeSale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sale processing failed" });
  }
});

// Cancel a sale - only managers and admins can do this
router.put("/:id/cancel", authorize("ADMIN", "MANAGER"), async (req, res) => {
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

    // Cancel the sale and restore the stock in one transaction
    await prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id }, data: { status: "CANCELLED" } });

      for (const item of sale.saleItems) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
      }
    });

    res.json({ message: "Sale cancelled and stock restored" });
  } catch (err) {
    res.status(500).json({ error: "Could not cancel sale" });
  }
});

module.exports = router;

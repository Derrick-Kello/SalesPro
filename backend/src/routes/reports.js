// Reporting and analytics - gives managers and admins a view of how the business is doing.

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// All reports are restricted to managers and admins
router.use(authenticate, authorize("ADMIN", "MANAGER"));

// Daily sales summary - total revenue, number of transactions, and top products
router.get("/daily", async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end }, status: "COMPLETED" },
      include: {
        saleItems: { include: { product: true } },
        payment: true,
        user: { select: { fullName: true } },
      },
    });

    const totalRevenue = sales.reduce((sum, s) => sum + s.grandTotal, 0);
    const totalTransactions = sales.length;

    // Figure out which products sold the most today
    const productSales = {};
    sales.forEach((sale) => {
      sale.saleItems.forEach((item) => {
        const key = item.productId;
        if (!productSales[key]) {
          productSales[key] = { name: item.product.name, quantity: 0, revenue: 0 };
        }
        productSales[key].quantity += item.quantity;
        productSales[key].revenue += item.subtotal;
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    res.json({ date: targetDate, totalRevenue, totalTransactions, topProducts, sales });
  } catch (err) {
    res.status(500).json({ error: "Could not generate daily report" });
  }
});

// Weekly sales - groups revenue by day for the past 7 days
router.get("/weekly", async (req, res) => {
  try {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end }, status: "COMPLETED" },
      orderBy: { createdAt: "asc" },
    });

    // Group sales by day
    const byDay = {};
    sales.forEach((sale) => {
      const day = sale.createdAt.toISOString().split("T")[0];
      if (!byDay[day]) byDay[day] = { date: day, revenue: 0, transactions: 0 };
      byDay[day].revenue += sale.grandTotal;
      byDay[day].transactions += 1;
    });

    const totalRevenue = sales.reduce((sum, s) => sum + s.grandTotal, 0);

    res.json({ totalRevenue, totalTransactions: sales.length, dailyBreakdown: Object.values(byDay) });
  } catch (err) {
    res.status(500).json({ error: "Could not generate weekly report" });
  }
});

// Product performance - which products are selling and which are not
router.get("/products", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = { sale: { status: "COMPLETED" } };
    if (startDate || endDate) {
      where.sale.createdAt = {};
      if (startDate) where.sale.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.sale.createdAt.lte = end;
      }
    }

    const items = await prisma.saleItem.findMany({
      where,
      include: { product: { select: { name: true, category: true } } },
    });

    // Aggregate by product
    const productMap = {};
    items.forEach((item) => {
      const key = item.productId;
      if (!productMap[key]) {
        productMap[key] = {
          productId: key,
          name: item.product.name,
          category: item.product.category,
          totalQuantity: 0,
          totalRevenue: 0,
        };
      }
      productMap[key].totalQuantity += item.quantity;
      productMap[key].totalRevenue += item.subtotal;
    });

    const result = Object.values(productMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Could not generate product report" });
  }
});

// Cashier performance - how much each cashier has sold
router.get("/cashiers", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = { status: "COMPLETED" };
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
      include: { user: { select: { fullName: true, username: true } } },
    });

    // Group by cashier
    const cashierMap = {};
    sales.forEach((sale) => {
      const key = sale.userId;
      if (!cashierMap[key]) {
        cashierMap[key] = {
          userId: key,
          fullName: sale.user.fullName,
          username: sale.user.username,
          totalSales: 0,
          totalRevenue: 0,
        };
      }
      cashierMap[key].totalSales += 1;
      cashierMap[key].totalRevenue += sale.grandTotal;
    });

    const result = Object.values(cashierMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Could not generate cashier report" });
  }
});

// Inventory report - current stock levels with low stock flagged
router.get("/inventory", async (req, res) => {
  try {
    const inventory = await prisma.inventory.findMany({
      include: { product: true },
      orderBy: { quantity: "asc" },
    });

    const result = inventory.map((item) => ({
      ...item,
      isLowStock: item.quantity <= item.lowStockAlert,
    }));

    const lowStockCount = result.filter((i) => i.isLowStock).length;
    res.json({ lowStockCount, inventory: result });
  } catch (err) {
    res.status(500).json({ error: "Could not generate inventory report" });
  }
});

module.exports = router;

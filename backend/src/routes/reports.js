const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");
const cache = require("../cache");
const { resolveBranchId } = require("../utils/branchScope");

const router = express.Router();

module.exports = router;

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  return fn().then(data => { cache.set(key, data); return data; });
}

// ── Overview stats ────────────────────────────────────────────────────────────
router.get("/overview-stats", authenticate, (req, res) => {
  const branchId = resolveBranchId(req);
  const cacheKey = branchId ? `overview-stats-branch-${branchId}` : "overview-stats";

  return cached(cacheKey, async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek  = new Date(now);
    startOfWeek.setDate(now.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);

    const branchFilter = branchId ? `AND "branchId" = ${branchId}` : "";
    const salesWhere = { createdAt: { gte: startOfMonth }, status: "COMPLETED", ...(branchId ? { branchId } : {}) };
    const expensesWhere = { date: { gte: startOfMonth }, ...(branchId ? { branchId } : {}) };

    const [
      salesAgg,
      expensesAgg,
      lowStockItems,
      weeklySales,
      weeklyExpenses,
      topProductItems,
      paymentAgg,
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: salesWhere,
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
      prisma.expense.aggregate({
        where: expensesWhere,
        _sum: { amount: true },
      }),
      prisma.branchInventory.findMany({
        where: { quantity: { lte: 10 }, ...(branchId ? { branchId } : {}) },
        select: { quantity: true, lowStockAlert: true, product: { select: { name: true } } },
        orderBy: { quantity: "asc" },
        take: 20,
      }),
      prisma.$queryRawUnsafe(`
        SELECT DATE("createdAt")::text AS date, SUM("grandTotal")::float AS sales
        FROM sales
        WHERE "createdAt" >= $1 AND status = 'COMPLETED' ${branchFilter}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `, startOfWeek),
      prisma.$queryRawUnsafe(`
        SELECT DATE(date)::text AS date, SUM(amount)::float AS expenses
        FROM expenses
        WHERE date >= $1 ${branchId ? `AND "branchId" = ${branchId}` : ""}
        GROUP BY DATE(date)
        ORDER BY date ASC
      `, startOfWeek),
      prisma.$queryRawUnsafe(`
        SELECT si."productId" AS id, p.name, SUM(si.quantity)::int AS qty, SUM(si.subtotal)::float AS revenue
        FROM sale_items si
        JOIN products p ON p.id = si."productId"
        JOIN sales s ON s.id = si."saleId"
        WHERE s."createdAt" >= $1 AND s.status = 'COMPLETED' ${branchFilter}
        GROUP BY si."productId", p.name
        ORDER BY qty DESC
        LIMIT 8
      `, startOfMonth),
      prisma.$queryRawUnsafe(`
        SELECT py.method, SUM(py."amountPaid")::float AS amount
        FROM payments py
        JOIN sales s ON s.id = py."saleId"
        WHERE s."createdAt" >= $1 AND s.status = 'COMPLETED' ${branchFilter}
        GROUP BY py.method
      `, startOfMonth),
    ]);

    const weeklyMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weeklyMap[d.toISOString().split("T")[0]] = { sales: 0, expenses: 0 };
    }
    weeklySales.forEach(r => { if (weeklyMap[r.date]) weeklyMap[r.date].sales = r.sales; });
    weeklyExpenses.forEach(r => { if (weeklyMap[r.date]) weeklyMap[r.date].expenses = r.expenses; });

    const actualLowStock = lowStockItems.filter(i => i.quantity <= i.lowStockAlert);

    return {
      totalSales:       salesAgg._sum.grandTotal ?? 0,
      totalExpenses:    expensesAgg._sum.amount ?? 0,
      totalTransactions: salesAgg._count.id,
      lowStockCount:    actualLowStock.length,
      lowStockItems:    actualLowStock.slice(0, 10).map(i => ({
        name: i.product.name, qty: i.quantity, alert: i.lowStockAlert,
      })),
      weeklyChart:      Object.entries(weeklyMap).map(([date, v]) => ({ date, ...v })),
      topProducts:      topProductItems,
      paymentBreakdown: paymentAgg,
    };
  })
  .then(data => res.json(data))
  .catch(err => { console.error(err); res.status(500).json({ error: "Could not fetch overview stats" }); });
});

// ── Daily report ─────────────────────────────────────────────────────────────
router.get("/daily", authenticate, authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const start = new Date(targetDate); start.setHours(0, 0, 0, 0);
    const end   = new Date(targetDate); end.setHours(23, 59, 59, 999);
    const branchFilter = branchId ? `AND "branchId" = ${branchId}` : "";

    const [agg, topProducts] = await Promise.all([
      prisma.sale.aggregate({
        where: { createdAt: { gte: start, lte: end }, status: "COMPLETED", ...(branchId ? { branchId } : {}) },
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
      prisma.$queryRawUnsafe(`
        SELECT p.name, SUM(si.quantity)::int AS quantity, SUM(si.subtotal)::float AS revenue
        FROM sale_items si
        JOIN products p ON p.id = si."productId"
        JOIN sales s ON s.id = si."saleId"
        WHERE s."createdAt" >= $1 AND s."createdAt" <= $2 AND s.status = 'COMPLETED' ${branchFilter}
        GROUP BY p.name ORDER BY revenue DESC LIMIT 10
      `, start, end),
    ]);

    res.json({
      date: targetDate,
      totalRevenue: agg._sum.grandTotal ?? 0,
      totalTransactions: agg._count.id,
      topProducts,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not generate daily report" });
  }
});

// ── Weekly report ─────────────────────────────────────────────────────────────
router.get("/weekly", authenticate, authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const end   = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    const branchFilter = branchId ? `AND "branchId" = ${branchId}` : "";

    const [agg, dailyBreakdown] = await Promise.all([
      prisma.sale.aggregate({
        where: { createdAt: { gte: start, lte: end }, status: "COMPLETED", ...(branchId ? { branchId } : {}) },
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
      prisma.$queryRawUnsafe(`
        SELECT DATE("createdAt")::text AS date,
               COUNT(*)::int AS transactions,
               SUM("grandTotal")::float AS revenue
        FROM sales
        WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'COMPLETED' ${branchFilter}
        GROUP BY DATE("createdAt") ORDER BY date ASC
      `, start, end),
    ]);

    res.json({
      totalRevenue: agg._sum.grandTotal ?? 0,
      totalTransactions: agg._count.id,
      dailyBreakdown,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not generate weekly report" });
  }
});

// ── Product performance ───────────────────────────────────────────────────────
router.get("/products", authenticate, authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0);
    const end   = endDate   ? (() => { const d = new Date(endDate); d.setHours(23,59,59,999); return d; })() : new Date();
    const branchFilter = branchId ? `AND s."branchId" = ${branchId}` : "";

    const result = await prisma.$queryRawUnsafe(`
      SELECT si."productId" AS "productId", p.name, p.category,
             SUM(si.quantity)::int AS "totalQuantity",
             SUM(si.subtotal)::float AS "totalRevenue"
      FROM sale_items si
      JOIN products p ON p.id = si."productId"
      JOIN sales s ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED' AND s."createdAt" >= $1 AND s."createdAt" <= $2 ${branchFilter}
      GROUP BY si."productId", p.name, p.category
      ORDER BY "totalRevenue" DESC
    `, start, end);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Could not generate product report" });
  }
});

// ── Cashier performance ───────────────────────────────────────────────────────
router.get("/cashiers", authenticate, authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0);
    const end   = endDate   ? (() => { const d = new Date(endDate); d.setHours(23,59,59,999); return d; })() : new Date();
    const branchFilter = branchId ? `AND s."branchId" = ${branchId}` : "";

    const result = await prisma.$queryRawUnsafe(`
      SELECT s."userId" AS "userId", u."fullName" AS "fullName", u.username,
             COUNT(s.id)::int AS "totalSales",
             SUM(s."grandTotal")::float AS "totalRevenue"
      FROM sales s
      JOIN users u ON u.id = s."userId"
      WHERE s.status = 'COMPLETED' AND s."createdAt" >= $1 AND s."createdAt" <= $2 ${branchFilter}
      GROUP BY s."userId", u."fullName", u.username
      ORDER BY "totalRevenue" DESC
    `, start, end);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Could not generate cashier report" });
  }
});

// ── Inventory report ──────────────────────────────────────────────────────────
router.get("/inventory", authenticate, authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const where = branchId ? { branchId } : {};

    const inventory = await prisma.branchInventory.findMany({
      where,
      select: {
        productId: true, quantity: true, lowStockAlert: true, supplier: true,
        branchId: true,
        product: { select: { name: true, category: true } },
        branch: { select: { name: true } },
      },
      orderBy: { quantity: "asc" },
    });

    const result = inventory.map(i => ({ ...i, isLowStock: i.quantity <= i.lowStockAlert }));
    res.json({ lowStockCount: result.filter(i => i.isLowStock).length, inventory: result });
  } catch (err) {
    res.status(500).json({ error: "Could not generate inventory report" });
  }
});

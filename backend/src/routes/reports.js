const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");
const cache = require("../cache");
const { resolveBranchId } = require("../utils/branchScope");

const router = express.Router();

/** Expense category names used to surface inventory purchase flows on P&L (create these in Expense Categories if missing). */
const INVENTORY_PURCHASES_CATEGORY = "Inventory Purchases";
const PURCHASE_RETURNS_CATEGORY = "Purchase Returns";

/**
 * Mirrors GET /sales: only constrain `Sale.createdAt` when startDate and/or endDate are present.
 * If both are omitted, no date filter → same scope as Sales History default list (all periods).
 */
function prismaSaleCreatedAtClause(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const createdAt = {};
  if (startDate) createdAt.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    createdAt.lte = end;
  }
  return { createdAt };
}

/** Expense rows use calendar `date` — same boundary rules as sales list. */
function prismaExpenseDateClause(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const date = {};
  if (startDate) date.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    date.lte = end;
  }
  return { date };
}

/** `sales s` predicates for Profit & Loss (completed sales; same boundaries as GET /sales). */
function profitLossCompletedSalePredicates(startDate, endDate, branchId) {
  const predicates = [`s.status = 'COMPLETED'`];
  const binds = [];
  let p = 1;
  if (startDate) {
    predicates.push(`s."createdAt" >= $${p}`);
    binds.push(new Date(startDate));
    p++;
  }
  if (endDate) {
    const ed = new Date(endDate);
    ed.setHours(23, 59, 59, 999);
    predicates.push(`s."createdAt" <= $${p}`);
    binds.push(ed);
    p++;
  }
  if (branchId !== undefined && branchId !== null) {
    predicates.push(`s."branchId" = $${p}`);
    binds.push(parseInt(branchId, 10));
    p++;
  }
  return { predicates, binds };
}

/** COGS from completed sales; date filters match GET /sales semantics. */
async function queryProfitLossCogs(startDate, endDate, branchId) {
  const { predicates, binds } = profitLossCompletedSalePredicates(startDate, endDate, branchId);
  const sql = `
        SELECT COALESCE(SUM(si.quantity * p."costPrice"), 0)::float AS "cogs"
        FROM sale_items si
        JOIN products p ON p.id = si."productId"
        JOIN sales s ON s.id = si."saleId"
        WHERE ${predicates.join(" AND ")}
      `;
  return prisma.$queryRawUnsafe(sql, ...binds);
}

/** Sum discount + shipping straight from `sales` (matches list UI / avoids Prisma _sum quirks on Float). */
async function queryProfitLossDiscountShippingTotals(startDate, endDate, branchId) {
  const { predicates, binds } = profitLossCompletedSalePredicates(startDate, endDate, branchId);
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT COALESCE(SUM(s.discount), 0)::float AS "discount",
           COALESCE(SUM(s.shipping), 0)::float AS "shipping"
    FROM sales s
    WHERE ${predicates.join(" AND ")}
    `,
    ...binds
  );
  const row = rows[0];
  return {
    discount: Number(row?.discount ?? 0),
    shipping: Number(row?.shipping ?? 0),
  };
}

async function queryProfitLossDiscountShippingByBranch(startDate, endDate, branchId) {
  const { predicates, binds } = profitLossCompletedSalePredicates(startDate, endDate, branchId);
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT s."branchId" AS "branchId",
           COALESCE(SUM(s.discount), 0)::float AS "totalDiscount",
           COALESCE(SUM(s.shipping), 0)::float AS "totalShipping"
    FROM sales s
    WHERE ${predicates.join(" AND ")}
    GROUP BY s."branchId"
    ORDER BY s."branchId" NULLS LAST
    `,
    ...binds
  );
  return rows.map((r) => ({
    branchId: r.branchId,
    totalDiscount: Number(r.totalDiscount ?? 0),
    totalShipping: Number(r.totalShipping ?? 0),
  }));
}

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

// ── Profit & Loss (date range + branch; not cached) ──────────────────────────
router.get("/profit-loss", authenticate, authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const { startDate, endDate } = req.query;

    const saleBranch = branchId ? { branchId } : {};
    const expenseBranch = branchId ? { branchId } : {};

    const saleDateClause = prismaSaleCreatedAtClause(startDate, endDate);
    const expenseDateClause = prismaExpenseDateClause(startDate, endDate);

    const saleWhereCompleted = {
      status: "COMPLETED",
      ...saleBranch,
      ...saleDateClause,
    };

    const saleWhereRefunded = {
      status: "REFUNDED",
      ...saleBranch,
      ...saleDateClause,
    };

    const [purchaseCat, returnCat] = await Promise.all([
      prisma.expenseCategory.findFirst({ where: { name: INVENTORY_PURCHASES_CATEGORY } }),
      prisma.expenseCategory.findFirst({ where: { name: PURCHASE_RETURNS_CATEGORY } }),
    ]);

    const [
      salesCompleted,
      discountShippingTotals,
      discountShippingByBranchRaw,
      salesRefunded,
      paymentsAgg,
      expensesAgg,
      purchasesAgg,
      returnsAgg,
      cogsRow,
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: saleWhereCompleted,
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
      queryProfitLossDiscountShippingTotals(startDate, endDate, branchId),
      queryProfitLossDiscountShippingByBranch(startDate, endDate, branchId),
      prisma.sale.aggregate({
        where: saleWhereRefunded,
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
      prisma.payment.aggregate({
        where: {
          sale: {
            status: "COMPLETED",
            ...saleBranch,
            ...saleDateClause,
          },
        },
        _sum: { amountPaid: true },
      }),
      prisma.expense.aggregate({
        where: {
          ...expenseBranch,
          ...expenseDateClause,
        },
        _sum: { amount: true },
      }),
      purchaseCat
        ? prisma.expense.aggregate({
            where: {
              categoryId: purchaseCat.id,
              ...expenseBranch,
              ...expenseDateClause,
            },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: null } }),
      returnCat
        ? prisma.expense.aggregate({
            where: {
              categoryId: returnCat.id,
              ...expenseBranch,
              ...expenseDateClause,
            },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: null } }),
      queryProfitLossCogs(startDate, endDate, branchId),
    ]);

    const salesMade = salesCompleted._sum.grandTotal ?? 0;
    const salesReturns = salesRefunded._sum.grandTotal ?? 0;
    const netRevenue = salesMade - salesReturns;
    const totalPaymentsReceived = paymentsAgg._sum.amountPaid ?? 0;
    const totalExpenses = expensesAgg._sum.amount ?? 0;
    const inventoryPurchases = purchasesAgg._sum.amount ?? 0;
    const purchaseReturns = returnsAgg._sum.amount ?? 0;
    const cogs = cogsRow[0]?.cogs ?? 0;
    const grossProfit = netRevenue - cogs;
    const netProfit = grossProfit - totalExpenses;
    const totalDiscountApplied = discountShippingTotals.discount;
    const totalShippingCharges = discountShippingTotals.shipping;

    const branchIdsWithSales = discountShippingByBranchRaw.map((r) => r.branchId).filter((id) => id != null);
    const branchRecords = branchIdsWithSales.length
      ? await prisma.branch.findMany({
          where: { id: { in: branchIdsWithSales } },
          select: { id: true, name: true },
        })
      : [];
    const branchNameById = Object.fromEntries(branchRecords.map((b) => [b.id, b.name]));

    const discountShippingByBranch = discountShippingByBranchRaw
      .map((r) => ({
        branchId: r.branchId,
        branchName: r.branchId == null ? "No branch" : (branchNameById[r.branchId] || "Unknown branch"),
        totalDiscount: r.totalDiscount,
        totalShipping: r.totalShipping,
      }))
      .sort((a, b) => a.branchName.localeCompare(b.branchName));

    res.json({
      startDate: startDate || null,
      endDate: endDate || null,
      /** When false, aggregates use every completed sale (same as Sales History without date filters). */
      dateFiltered: !!(startDate || endDate),
      branchId: branchId ?? null,
      salesMade,
      salesReturns,
      netRevenue,
      inventoryPurchases,
      purchaseReturns,
      totalExpenses,
      totalPaymentsReceived,
      costOfGoodsSold: cogs,
      grossProfit,
      netProfit,
      totalDiscountApplied,
      totalShippingCharges,
      discountShippingByBranch,
      completedTransactionCount: salesCompleted._count.id,
      refundedTransactionCount: salesRefunded._count.id,
      purchaseCategoryMissing: !purchaseCat,
      purchaseReturnCategoryMissing: !returnCat,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not generate profit and loss report" });
  }
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

module.exports = router;

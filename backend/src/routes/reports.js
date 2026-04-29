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

/** Invoiced sales = full or partial checkout (COGS/discount/shipping totals; inventory already moved). */
function profitLossRevenueSalePredicates(startDate, endDate, branchId) {
  const predicates = [`s.status IN ('COMPLETED','PARTIALLY_PAID')`];
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
  const { predicates, binds } = profitLossRevenueSalePredicates(startDate, endDate, branchId);
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
  const { predicates, binds } = profitLossRevenueSalePredicates(startDate, endDate, branchId);
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
  const { predicates, binds } = profitLossRevenueSalePredicates(startDate, endDate, branchId);
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

/** Money still owed on partial checkouts — not yet received as cash card on P&amp;L. */
async function queryProfitLossPartialOutstanding(startDate, endDate, branchId) {
  const predicates = [`s.status = 'PARTIALLY_PAID'`];
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
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      COUNT(*)::int AS "partialCount",
      COALESCE(SUM(GREATEST(0::float, s."grandTotal" - pm."amountPaid")), 0)::float AS "outstandingTotal"
    FROM sales s
    INNER JOIN payments pm ON pm."saleId" = s.id
    WHERE ${predicates.join(" AND ")}
    `,
    ...binds
  );
  const row = rows[0];
  return {
    partialCount: Number(row?.partialCount ?? 0),
    outstandingTotal: Number(row?.outstandingTotal ?? 0),
  };
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

    const saleWhereInvoiced = {
      status: { in: ["COMPLETED", "PARTIALLY_PAID"] },
      ...saleBranch,
      ...saleDateClause,
    };

    const saleWhereFullPaid = {
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
      salesInvoiced,
      discountShippingTotals,
      discountShippingByBranchRaw,
      salesRefunded,
      paymentsAgg,
      expensesAgg,
      purchasesAgg,
      returnsAgg,
      cogsRow,
      partialOutstanding,
      fullPaidSaleCount,
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: saleWhereInvoiced,
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
            status: { in: ["COMPLETED", "PARTIALLY_PAID"] },
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
      queryProfitLossPartialOutstanding(startDate, endDate, branchId),
      prisma.sale.count({ where: saleWhereFullPaid }),
    ]);

    const salesMade = salesInvoiced._sum.grandTotal ?? 0;
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
      /** Fully paid invoices (sale closed). */
      completedTransactionCount: fullPaidSaleCount,
      /** Invoiced includes partial checkouts whose balance may still be open. */
      invoicedTransactionCount: salesInvoiced._count.id,
      partiallyPaidSalesCount: partialOutstanding.partialCount,
      /** Amount still owed on partial invoices — excluded from Payments received until collected. */
      outstandingReceivables: partialOutstanding.outstandingTotal,
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

// ── Warehouse report (warehouse_inventory + transfer economics + history) ──
router.get("/warehouse", authenticate, authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const scopeBranchId = resolveBranchId(req);
    const warehouseIdParam =
      req.query.warehouseId != null && req.query.warehouseId !== ""
        ? parseInt(req.query.warehouseId, 10)
        : null;
    const { startDate, endDate } = req.query;

    const whWhere = { isActive: true };
    if (!Number.isNaN(warehouseIdParam) && warehouseIdParam !== null && warehouseIdParam > 0) {
      whWhere.id = warehouseIdParam;
    }
    if (scopeBranchId !== undefined && scopeBranchId !== null) {
      whWhere.branchId = scopeBranchId;
    }

    const list = await prisma.warehouse.findMany({
      where: whWhere,
      orderBy: { name: "asc" },
      include: { branch: { select: { id: true, name: true } } },
    });

    const summaries = [];
    let rollupPieces = 0;
    let rollupCost = 0;
    let rollupSkus = 0;

    for (const w of list) {
      const agg = await prisma.$queryRawUnsafe(
        `
        SELECT
          COUNT(*) FILTER (WHERE wi.quantity > 0)::int AS "skuCount",
          COALESCE(SUM(wi.quantity), 0)::bigint AS "pieces",
          COALESCE(SUM(wi.quantity * COALESCE(p."costPrice", 0)), 0)::double precision AS "costTotal"
        FROM warehouse_inventory wi
        JOIN products p ON p.id = wi."productId"
        WHERE wi."warehouseId" = $1
        `,
        w.id
      );
      const r = agg[0] || {};
      const skuCount = Number(r.skuCount ?? 0);
      const pieces = Number(r.pieces ?? 0);
      const costTotal = Number(r.costTotal ?? 0);

      summaries.push({
        warehouseId: w.id,
        warehouseName: w.name,
        location: w.location,
        branchId: w.branchId,
        branchName: w.branch?.name ?? null,
        distinctSkus: skuCount,
        totalPieces: pieces,
        totalCostValue: costTotal,
        stockNote:
          pieces === 0
            ? "No quantities recorded yet — receive stock via Warehouses → Stock (or transfers from a branch)."
            : null,
      });

      rollupPieces += pieces;
      rollupCost += costTotal;
      rollupSkus += skuCount;
    }

    /** Product detail when one warehouse is selected */
    let productLines = [];
    let productLinesDetailWarehouseId = null;
    const singleWarehouse = list.length === 1
      ? list[0]
      : Number.isFinite(warehouseIdParam)
        ? list.find((x) => x.id === warehouseIdParam)
        : null;

    if (singleWarehouse) {
      productLinesDetailWarehouseId = singleWarehouse.id;
      const wis = await prisma.warehouseInventory.findMany({
        where: { warehouseId: singleWarehouse.id, quantity: { gt: 0 } },
        include: { product: { select: { id: true, name: true, category: true, costPrice: true } } },
        orderBy: { productId: "asc" },
      });
      productLines = wis
        .map((wi) => {
          const cp = wi.product?.costPrice ?? 0;
          return {
            productId: wi.productId,
            name: wi.product?.name ?? "—",
            category: wi.product?.category ?? "—",
            quantity: wi.quantity,
            unitCostPrice: cp,
            lineCostValue: wi.quantity * cp,
          };
        })
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    const andClauses = [];
    if (startDate || endDate) {
      const dateFilter = { createdAt: {} };
      if (startDate) dateFilter.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.lte = end;
      }
      andClauses.push(dateFilter);
    }

    if (scopeBranchId !== undefined && scopeBranchId !== null) {
      andClauses.push({
        OR: [
          { fromBranchId: scopeBranchId },
          { toBranchId: scopeBranchId },
          { fromWarehouse: { branchId: scopeBranchId } },
          { toWarehouse: { branchId: scopeBranchId } },
        ],
      });
    }

    if (!Number.isNaN(warehouseIdParam) && warehouseIdParam && warehouseIdParam > 0) {
      andClauses.push({
        OR: [{ fromWarehouseId: warehouseIdParam }, { toWarehouseId: warehouseIdParam }],
      });
    }

    const transferWhereBuilt = andClauses.length ? { AND: andClauses } : {};

    const transfersRaw = await prisma.stockTransfer.findMany({
      where: transferWhereBuilt,
      take: 750,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true } },
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        fromWarehouse: { select: { name: true, branchId: true } },
        toWarehouse: { select: { name: true, branchId: true } },
        transferredBy: { select: { fullName: true } },
      },
    });

    const transferEconomics = {
      totalLines: 0,
      totalCostRecorded: 0,
      outboundFromWarehouseCost: 0,
      inboundToWarehouseCost: 0,
      warehouseToWarehouseCost: 0,
      warehouseToBranchCost: 0,
      branchToWarehouseCost: 0,
    };

    for (const t of transfersRaw) {
      const cost =
        typeof t.totalValue === "number" ? t.totalValue : (t.quantity || 0) * (t.costPrice || 0);
      transferEconomics.totalLines += 1;
      transferEconomics.totalCostRecorded += cost;
      const fw = Boolean(t.fromWarehouseId);
      const tw = Boolean(t.toWarehouseId);
      const fb = Boolean(t.fromBranchId);
      const tb = Boolean(t.toBranchId);
      if (fw && !fb) transferEconomics.outboundFromWarehouseCost += cost;
      if (tw && !tb) transferEconomics.inboundToWarehouseCost += cost;
      if (fw && tw && !fb && !tb) transferEconomics.warehouseToWarehouseCost += cost;
      if (fw && tb && !fb) transferEconomics.warehouseToBranchCost += cost;
      if (fb && tw && !tb) transferEconomics.branchToWarehouseCost += cost;
    }

    const transferHistory = transfersRaw.map((t) => {
      const fromWh = t.fromWarehouse?.name ? `${t.fromWarehouse.name} (warehouse)` : null;
      const fromBr = t.fromBranch?.name ? `${t.fromBranch.name} (branch)` : null;
      const fromLabel = fromWh || fromBr || "—";
      const toWh = t.toWarehouse?.name ? `${t.toWarehouse.name} (warehouse)` : null;
      const toBr = t.toBranch?.name ? `${t.toBranch.name} (branch)` : null;
      const toLabel = toWh || toBr || "—";

      let routeHint = "Transfer";
      if (t.fromWarehouseId && t.toWarehouseId && !t.fromBranchId && !t.toBranchId) {
        routeHint = "Warehouse → Warehouse";
      } else if (t.fromWarehouseId && t.toBranchId && !t.fromBranchId) {
        routeHint = "Warehouse → Branch";
      } else if (t.fromBranchId && t.toWarehouseId && !t.toBranchId) {
        routeHint = "Branch → Warehouse";
      }

      return {
        id: t.id,
        createdAt: t.createdAt,
        productName: t.product?.name ?? "—",
        quantity: t.quantity,
        unitCostRecorded: t.costPrice,
        totalCostRecorded:
          typeof t.totalValue === "number" ? t.totalValue : t.quantity * (t.costPrice || 0),
        fromLabel,
        toLabel,
        routeHint,
        transferredByName: t.transferredBy?.fullName ?? "—",
        note: t.note || null,
      };
    });

    res.json({
      dateFiltered: !!(startDate || endDate),
      startDate: startDate || null,
      endDate: endDate || null,
      summaries,
      rollup: {
        warehousesListed: summaries.length,
        distinctSkusHedged: rollupSkus,
        totalPieces: rollupPieces,
        totalCostValue: rollupCost,
        rollupHint: null,
      },
      productLinesDetailWarehouseId,
      /** @deprecated */
      productLinesDetailForBranchId: productLinesDetailWarehouseId,
      productLines,
      transferEconomics,
      transferHistory,
    });
  } catch (err) {
    console.error("[GET /reports/warehouse]", err);
    res.status(500).json({ error: "Could not generate warehouse report" });
  }
});

module.exports = router;

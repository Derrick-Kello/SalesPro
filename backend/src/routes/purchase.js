const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, authorize("ADMIN", "MANAGER"));

/** Same access rules as warehouse inventory routes */
async function warehouseForUserOr404(req, res, idParam) {
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid warehouse id" });
    return null;
  }
  const wh = await prisma.warehouse.findUnique({
    where: { id },
    include: { branch: { select: { id: true, name: true } } },
  });
  if (!wh) {
    res.status(404).json({ error: "Warehouse not found" });
    return null;
  }
  if (!wh.isActive) {
    res.status(403).json({ error: "Warehouse is inactive" });
    return null;
  }
  if (req.user.role === "ADMIN") return wh;
  if (req.user.role === "MANAGER") {
    if (wh.branchId != null && wh.branchId === req.user.branchId) return wh;
    return void res.status(403).json({ error: "Not allowed for this warehouse" });
  }
  res.status(403).json({ error: "Insufficient permissions" });
  return null;
}

/**
 * Inventory + receipt in one transaction (supplier required — trimmed non-empty).
 */
async function executeReceive(tx, whId, productId, quantity, supplierTrim, note, userId) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) {
    const e = new Error("Product not found");
    e.status = 404;
    throw e;
  }
  if (!product.isActive) {
    const e = new Error("Product is inactive");
    e.status = 400;
    throw e;
  }

  const unitCost = product.costPrice || 0;
  const lineValue = quantity * unitCost;

  await tx.warehouseInventory.upsert({
    where: { warehouseId_productId: { warehouseId: whId, productId } },
    update: {
      quantity: { increment: quantity },
      supplier: supplierTrim,
    },
    create: {
      warehouseId: whId,
      productId,
      quantity,
      supplier: supplierTrim,
    },
  });

  const receipt = await tx.warehouseStockReceipt.create({
    data: {
      warehouseId: whId,
      productId,
      quantity,
      unitCostSnapshot: unitCost,
      lineValueTotal: lineValue,
      supplier: supplierTrim,
      note: note && String(note).trim() ? String(note).trim() : null,
      receivedById: userId,
    },
    include: {
      product: { select: { id: true, name: true, category: true, costPrice: true } },
      warehouse: { select: { id: true, name: true, branchId: true } },
      receivedBy: { select: { id: true, fullName: true } },
    },
  });

  const updatedWi = await tx.warehouseInventory.findUnique({
    where: { warehouseId_productId: { warehouseId: whId, productId } },
    include: {
      product: { select: { id: true, name: true, category: true, costPrice: true } },
      warehouse: { select: { id: true, name: true } },
    },
  });

  return { receipt, warehouseInventory: updatedWi };
}

/**
 * Receive goods into warehouse inventory + immutable receipt row (Purchase flow).
 */
router.post(
  "/warehouse-receipts",
  checkPermission("inventory.adjust"),
  async (req, res) => {
    const { warehouseId, productId, quantity, supplier, note } = req.body;

    const whId =
      warehouseId !== undefined && warehouseId !== ""
        ? parseInt(warehouseId, 10)
        : null;
    const pid =
      productId !== undefined && productId !== "" ? parseInt(productId, 10) : null;
    const qty = quantity !== undefined && quantity !== "" ? parseInt(quantity, 10) : NaN;
    const supplierTrim = supplier != null ? String(supplier).trim() : "";

    if (!Number.isFinite(whId) || !Number.isFinite(pid) || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({
        error: "warehouseId, productId, and quantity (positive integer) are required",
      });
    }
    if (!supplierTrim) {
      return res.status(400).json({ error: "Supplier is required" });
    }

    const wh = await warehouseForUserOr404(req, res, String(whId));
    if (!wh) return;

    try {
      const result = await prisma.$transaction((tx) =>
        executeReceive(tx, whId, pid, qty, supplierTrim, note, req.user.id)
      );
      res.status(201).json(result);
    } catch (err) {
      console.error("[POST /purchase/warehouse-receipts]", err);
      const status = err.status || (err.message === "Product not found" ? 404 : 500);
      if (status >= 500) {
        return res.status(500).json({ error: "Could not record purchase receipt" });
      }
      return res.status(status).json({ error: err.message || "Bad request" });
    }
  }
);

/**
 * Bulk receive (same validations; supplier required on every line).
 * Body: { warehouseId, lines: [{ productId?, barcode?, quantity, supplier, note? }] }
 */
router.post(
  "/warehouse-receipts/bulk",
  checkPermission("inventory.adjust"),
  async (req, res) => {
    const { warehouseId, lines } = req.body;
    const whId =
      warehouseId !== undefined && warehouseId !== ""
        ? parseInt(warehouseId, 10)
        : null;

    if (!Number.isFinite(whId) || whId <= 0) {
      return res.status(400).json({ error: "warehouseId is required" });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "lines must be a non-empty array" });
    }

    const wh = await warehouseForUserOr404(req, res, String(whId));
    if (!wh) return;

    const success = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const lineNum = i + 1;
      const supplierTrim = raw?.supplier != null ? String(raw.supplier).trim() : "";
      if (!supplierTrim) {
        errors.push({ line: lineNum, error: "Supplier is required" });
        continue;
      }

      const qtyRaw = raw?.quantity;
      const qty = parseInt(qtyRaw, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push({ line: lineNum, error: "quantity must be a positive integer" });
        continue;
      }

      let pid =
        raw?.productId != null && raw.productId !== ""
          ? parseInt(raw.productId, 10)
          : raw?.product_id != null && raw.product_id !== ""
            ? parseInt(raw.product_id, 10)
            : NaN;

      const bc =
        raw?.barcode != null && raw.barcode !== ""
          ? String(raw.barcode).trim()
          : null;

      try {
        if (!Number.isFinite(pid) || pid <= 0) {
          if (!bc) {
            errors.push({
              line: lineNum,
              error: "Provide productId or barcode",
            });
            continue;
          }
          const byBc = await prisma.product.findUnique({ where: { barcode: bc } });
          if (!byBc) {
            errors.push({ line: lineNum, error: `Unknown barcode "${bc}"` });
            continue;
          }
          pid = byBc.id;
        }

        const result = await prisma.$transaction((tx) =>
          executeReceive(tx, whId, pid, qty, supplierTrim, raw?.note, req.user.id)
        );
        success.push({ line: lineNum, receiptId: result.receipt.id, productId: pid });
      } catch (err) {
        errors.push({
          line: lineNum,
          error: err.message === "Product is inactive" ? err.message : err.message || "Failed",
        });
      }
    }

    res.json({
      warehouseId: whId,
      createdCount: success.length,
      failedCount: errors.length,
      success,
      errors,
    });
  }
);

/**
 * List receipt lines (newest first). Managers scoped to warehouses on their branch.
 */
router.get("/warehouse-receipts", async (req, res) => {
  try {
    const warehouseIdParam =
      req.query.warehouseId != null && req.query.warehouseId !== ""
        ? parseInt(req.query.warehouseId, 10)
        : null;
    const productIdParam =
      req.query.productId != null && req.query.productId !== ""
        ? parseInt(req.query.productId, 10)
        : null;
    const { startDate, endDate } = req.query;

    const andClauses = [];
    if (startDate || endDate) {
      const createdAt = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        createdAt.lte = e;
      }
      andClauses.push({ createdAt });
    }
    if (!Number.isNaN(warehouseIdParam) && warehouseIdParam !== null && warehouseIdParam > 0) {
      andClauses.push({ warehouseId: warehouseIdParam });
    }
    if (!Number.isNaN(productIdParam) && productIdParam !== null && productIdParam > 0) {
      andClauses.push({ productId: productIdParam });
    }

    if (req.user.role === "MANAGER" && req.user.branchId) {
      andClauses.push({
        warehouse: {
          branchId: req.user.branchId,
        },
      });
    }

    const where = andClauses.length === 0 ? {} : { AND: andClauses };

    const rows = await prisma.warehouseStockReceipt.findMany({
      where,
      take: 750,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { id: true, name: true, category: true, costPrice: true } },
        warehouse: { select: { id: true, name: true, location: true, branchId: true } },
        receivedBy: { select: { id: true, fullName: true } },
      },
    });

    const branchIds = [...new Set(rows.map((r) => r.warehouse.branchId).filter(Boolean))];
    const branches =
      branchIds.length > 0
        ? await prisma.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, name: true },
          })
        : [];
    const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));

    const json = rows.map((r) => ({
      ...r,
      warehouse: {
        ...r.warehouse,
        branchName: r.warehouse.branchId ? branchMap[r.warehouse.branchId] ?? null : null,
      },
    }));

    res.json(json);
  } catch (err) {
    console.error("[GET /purchase/warehouse-receipts]", err);
    res.status(500).json({ error: "Could not load purchase history" });
  }
});

module.exports = router;

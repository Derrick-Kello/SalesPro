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

    if (!Number.isFinite(whId) || !Number.isFinite(pid) || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({
        error: "warehouseId, productId, and quantity (positive integer) are required",
      });
    }

    const wh = await warehouseForUserOr404(req, res, String(whId));
    if (!wh) return;

    try {
      const product = await prisma.product.findUnique({ where: { id: pid } });
      if (!product) return res.status(404).json({ error: "Product not found" });
      if (!product.isActive) return res.status(400).json({ error: "Product is inactive" });

      const unitCost = product.costPrice || 0;
      const lineValue = qty * unitCost;

      const result = await prisma.$transaction(async (tx) => {
        await tx.warehouseInventory.upsert({
          where: { warehouseId_productId: { warehouseId: whId, productId: pid } },
          update: {
            quantity: { increment: qty },
            supplier:
              supplier !== undefined && supplier !== null && supplier !== ""
                ? String(supplier)
                : undefined,
          },
          create: {
            warehouseId: whId,
            productId: pid,
            quantity: qty,
            supplier: supplier || undefined,
          },
        });

        const receipt = await tx.warehouseStockReceipt.create({
          data: {
            warehouseId: whId,
            productId: pid,
            quantity: qty,
            unitCostSnapshot: unitCost,
            lineValueTotal: lineValue,
            supplier: supplier || null,
            note: note || null,
            receivedById: req.user.id,
          },
          include: {
            product: { select: { id: true, name: true, category: true, costPrice: true } },
            warehouse: { select: { id: true, name: true, branchId: true } },
            receivedBy: { select: { id: true, fullName: true } },
          },
        });

        const updatedWi = await tx.warehouseInventory.findUnique({
          where: { warehouseId_productId: { warehouseId: whId, productId: pid } },
          include: {
            product: { select: { id: true, name: true, category: true, costPrice: true } },
            warehouse: { select: { id: true, name: true } },
          },
        });

        return { receipt, warehouseInventory: updatedWi };
      });

      res.status(201).json(result);
    } catch (err) {
      console.error("[POST /purchase/warehouse-receipts]", err);
      res.status(500).json({ error: "Could not record purchase receipt" });
    }
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

    const where =
      andClauses.length === 0 ? {} : { AND: andClauses };

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

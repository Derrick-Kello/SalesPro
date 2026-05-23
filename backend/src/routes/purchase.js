const express = require("express");
const prisma = require("../prisma/client");
const transactionOptions = require("../prisma/transactionOptions");
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

const {
  validateReceiptTag,
  incrementTrackedTagQty,
  decrementTrackedTagQty,
} = require("../utils/tagHelpers");

const PURCHASE_STATUSES = new Set(["UNPAID", "PARTIAL", "PAID", "RETURNED"]);
function normalizePurchaseStatus(input, fallback = "UNPAID") {
  const v = String(input || fallback).trim().toUpperCase();
  return PURCHASE_STATUSES.has(v) ? v : fallback;
}

/**
 * Inventory + receipt in one transaction (supplier required — trimmed non-empty).
 */
async function executeReceive(tx, whId, productId, quantity, supplierTrim, note, userId, tagRef) {
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

  let receiptTagId = null;
  const rawTagId = tagRef?.tagId ?? tagRef;
  const rawTagName = tagRef?.tagName;
  if (rawTagId != null && rawTagId !== "") {
    const tid = parseInt(rawTagId, 10);
    if (Number.isFinite(tid) && tid > 0) {
      receiptTagId = await validateReceiptTag(tx, productId, tid);
    }
  } else if (rawTagName != null && String(rawTagName).trim()) {
    const name = String(rawTagName).trim();
    const tag = await tx.tag.upsert({
      where: { name },
      create: { name, createdById: userId },
      update: {},
    });
    await tx.productTag.upsert({
      where: { productId_tagId: { productId, tagId: tag.id } },
      create: { productId, tagId: tag.id, quantity: 0 },
      update: {},
    });
    receiptTagId = tag.id;
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

  if (receiptTagId) {
    await incrementTrackedTagQty(tx, productId, receiptTagId, quantity);
  }

  const paymentStatus = normalizePurchaseStatus(
    tagRef?.paymentStatus,
    tagRef?.isPaid ? "PAID" : "UNPAID"
  );
  const receipt = await tx.warehouseStockReceipt.create({
    data: {
      warehouseId: whId,
      productId,
      tagId: receiptTagId,
      quantity,
      unitCostSnapshot: unitCost,
      lineValueTotal: lineValue,
      isPaid: paymentStatus === "PAID",
      paymentStatus,
      paidAt: paymentStatus === "PAID" ? new Date() : null,
      supplier: supplierTrim,
      note: note && String(note).trim() ? String(note).trim() : null,
      receivedById: userId,
    },
    include: {
      product: { select: { id: true, name: true, category: true, costPrice: true } },
      warehouse: { select: { id: true, name: true, branchId: true } },
      receivedBy: { select: { id: true, fullName: true } },
      tag: { select: { id: true, name: true, group: true } },
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
    const { warehouseId, productId, quantity, supplier, note, tagId, tagName, isPaid, paymentStatus } = req.body;

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
      const result = await prisma.$transaction(
        (tx) =>
          executeReceive(tx, whId, pid, qty, supplierTrim, note, req.user.id, {
            tagId,
            tagName,
            isPaid: Boolean(isPaid),
            paymentStatus,
          }),
        transactionOptions
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

        const result = await prisma.$transaction(
          (tx) =>
            executeReceive(
              tx,
              whId,
              pid,
              qty,
              supplierTrim,
              raw?.note,
              req.user.id,
              {
                tagId: raw?.tagId ?? raw?.tag_id,
                tagName: raw?.tagName ?? raw?.tag_name ?? raw?.tag,
                isPaid: Boolean(raw?.isPaid),
                paymentStatus: raw?.paymentStatus,
              }
            ),
          transactionOptions
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
        tag: { select: { id: true, name: true } },
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

async function reverseReceiptStockImpact(tx, row) {
  const wi = await tx.warehouseInventory.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: row.warehouseId,
        productId: row.productId,
      },
    },
    select: { quantity: true },
  });
  if (!wi || wi.quantity < row.quantity) {
    const e = new Error(
      `Cannot update receipt #${row.id}: insufficient warehouse stock to reverse (${wi?.quantity ?? 0} on hand, need ${row.quantity}).`
    );
    e.status = 409;
    throw e;
  }
  await tx.warehouseInventory.update({
    where: {
      warehouseId_productId: {
        warehouseId: row.warehouseId,
        productId: row.productId,
      },
    },
    data: { quantity: { decrement: row.quantity } },
  });
  if (row.tagId) {
    await decrementTrackedTagQty(tx, row.productId, row.tagId, row.quantity);
  }
}

async function applyReceiptStockImpact(tx, { warehouseId, productId, quantity, tagId, supplierTrim }) {
  await tx.warehouseInventory.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    update: {
      quantity: { increment: quantity },
      supplier: supplierTrim,
    },
    create: {
      warehouseId,
      productId,
      quantity,
      supplier: supplierTrim,
    },
  });
  if (tagId) {
    await incrementTrackedTagQty(tx, productId, tagId, quantity);
  }
}

async function resolveReceiptTagId(tx, productId, { tagId, tagName }, userId) {
  if (tagId != null && tagId !== "") {
    const tid = parseInt(tagId, 10);
    if (Number.isFinite(tid) && tid > 0) {
      return validateReceiptTag(tx, productId, tid);
    }
  }
  if (tagName != null && String(tagName).trim()) {
    const name = String(tagName).trim();
    const tag = await tx.tag.upsert({
      where: { name },
      create: { name, createdById: userId },
      update: {},
    });
    await tx.productTag.upsert({
      where: { productId_tagId: { productId, tagId: tag.id } },
      create: { productId, tagId: tag.id, quantity: 0 },
      update: {},
    });
    return tag.id;
  }
  return null;
}

async function updateReceiptInTransaction(tx, row, patch, userId) {
  const supplierTrim =
    patch.supplier !== undefined
      ? String(patch.supplier).trim()
      : row.supplier != null
        ? String(row.supplier).trim()
        : "";
  if (!supplierTrim) {
    const e = new Error("Supplier is required");
    e.status = 400;
    throw e;
  }

  const newWarehouseId =
    patch.warehouseId != null && patch.warehouseId !== ""
      ? parseInt(patch.warehouseId, 10)
      : row.warehouseId;
  const newProductId =
    patch.productId != null && patch.productId !== ""
      ? parseInt(patch.productId, 10)
      : row.productId;
  const newQty =
    patch.quantity != null && patch.quantity !== ""
      ? parseInt(patch.quantity, 10)
      : row.quantity;

  if (
    !Number.isFinite(newWarehouseId) ||
    !Number.isFinite(newProductId) ||
    !Number.isFinite(newQty) ||
    newQty <= 0
  ) {
    const e = new Error("Warehouse, product, and positive quantity are required");
    e.status = 400;
    throw e;
  }

  const product = await tx.product.findUnique({ where: { id: newProductId } });
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

  const stockChanged =
    newWarehouseId !== row.warehouseId ||
    newProductId !== row.productId ||
    newQty !== row.quantity;

  let newTagId = row.tagId;
  if (patch.tagId !== undefined || patch.tagName !== undefined) {
    newTagId = await resolveReceiptTagId(
      tx,
      newProductId,
      { tagId: patch.tagId, tagName: patch.tagName },
      userId
    );
  }

  if (stockChanged) {
    await reverseReceiptStockImpact(tx, row);
    await applyReceiptStockImpact(tx, {
      warehouseId: newWarehouseId,
      productId: newProductId,
      quantity: newQty,
      tagId: newTagId,
      supplierTrim,
    });
  }

  const unitCost = product.costPrice || 0;
  const paymentStatus =
    patch.paymentStatus !== undefined
      ? normalizePurchaseStatus(patch.paymentStatus)
      : normalizePurchaseStatus(row.paymentStatus, row.isPaid ? "PAID" : "UNPAID");
  const isPaid = paymentStatus === "PAID";

  const data = {
    warehouseId: newWarehouseId,
    productId: newProductId,
    quantity: newQty,
    unitCostSnapshot: unitCost,
    lineValueTotal: newQty * unitCost,
    supplier: supplierTrim,
    tagId: newTagId,
    paymentStatus,
    isPaid,
    paidAt: isPaid ? row.paidAt || new Date() : null,
  };
  if (patch.note !== undefined) data.note = patch.note ? String(patch.note).trim() : null;
  else if (row.note != null) data.note = row.note;

  await tx.warehouseStockReceipt.update({
    where: { id: row.id },
    data,
  });
}

router.patch("/warehouse-receipts/bulk-edit", checkPermission("inventory.adjust"), async (req, res) => {
  const linePatches = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
  const supplier = req.body?.supplier != null ? String(req.body.supplier).trim() : undefined;
  const note = req.body?.note != null ? String(req.body.note).trim() : undefined;
  const paymentStatus =
    req.body?.paymentStatus !== undefined ? normalizePurchaseStatus(req.body.paymentStatus) : undefined;

  try {
    if (linePatches.length) {
      const work = [];
      for (const patch of linePatches) {
        const id = parseInt(patch.id, 10);
        if (!Number.isFinite(id) || id <= 0) continue;
        const row = await prisma.warehouseStockReceipt.findUnique({
          where: { id },
          include: { tag: { select: { id: true, name: true } } },
        });
        if (!row) return res.status(404).json({ error: `Receipt #${id} not found` });
        const wh = await warehouseForUserOr404(req, res, String(row.warehouseId));
        if (!wh) return;
        const targetWh =
          patch.warehouseId != null && patch.warehouseId !== ""
            ? String(patch.warehouseId)
            : String(row.warehouseId);
        if (targetWh !== String(row.warehouseId)) {
          const wh2 = await warehouseForUserOr404(req, res, targetWh);
          if (!wh2) return;
        }
        work.push({ row, patch });
      }
      await prisma.$transaction(async (tx) => {
        for (const { row, patch } of work) {
          await updateReceiptInTransaction(tx, row, patch, req.user.id);
        }
      }, transactionOptions);
      return res.json({ updated: work.length });
    }

    if (!ids.length) return res.status(400).json({ error: "ids or lines is required" });

    const rows = await prisma.warehouseStockReceipt.findMany({
      where: { id: { in: ids } },
    });
    for (const r of rows) {
      const wh = await warehouseForUserOr404(req, res, String(r.warehouseId));
      if (!wh) return;
    }

    const data = {};
    if (supplier !== undefined) {
      if (!supplier) return res.status(400).json({ error: "Supplier is required" });
      data.supplier = supplier;
    }
    if (note !== undefined) data.note = note || null;
    if (paymentStatus !== undefined) {
      data.paymentStatus = paymentStatus;
      data.isPaid = paymentStatus === "PAID";
      data.paidAt = paymentStatus === "PAID" ? new Date() : null;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: "Nothing to update" });
    await prisma.warehouseStockReceipt.updateMany({ where: { id: { in: ids } }, data });
    res.json({ updated: ids.length });
  } catch (err) {
    console.error("[PATCH /purchase/warehouse-receipts/bulk-edit]", err);
    const status = err.status || 500;
    if (status >= 500) return res.status(500).json({ error: "Could not update purchase rows" });
    return res.status(status).json({ error: err.message || "Could not update purchase rows" });
  }
});

router.post("/warehouse-receipts/bulk-payment", checkPermission("inventory.adjust"), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
  if (!ids.length) return res.status(400).json({ error: "ids is required" });
  const status = normalizePurchaseStatus(req.body?.paymentStatus);
  const isPaid = status === "PAID";
  try {
    const rows = await prisma.warehouseStockReceipt.findMany({
      where: { id: { in: ids } },
      select: { id: true, warehouseId: true },
    });
    for (const r of rows) {
      // eslint-disable-next-line no-await-in-loop
      const wh = await warehouseForUserOr404(req, res, String(r.warehouseId));
      if (!wh) return;
    }
    await prisma.warehouseStockReceipt.updateMany({
      where: { id: { in: ids } },
      data: {
        paymentStatus: status,
        isPaid,
        paidAt: isPaid ? new Date() : null,
      },
    });
    res.json({ updated: ids.length, paymentStatus: status });
  } catch (err) {
    console.error("[POST /purchase/warehouse-receipts/bulk-payment]", err);
    res.status(500).json({ error: "Could not update payment status" });
  }
});

router.post("/warehouse-receipts/bulk-return", checkPermission("inventory.adjust"), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
  if (!ids.length) return res.status(400).json({ error: "ids is required" });
  const reason = String(req.body?.note || "Purchase return").trim();

  try {
    const rows = await prisma.warehouseStockReceipt.findMany({
      where: { id: { in: ids } },
      include: { warehouse: { select: { id: true } } },
    });

    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const wh = await warehouseForUserOr404(req, res, String(r.warehouseId));
        if (!wh) throw new Error("Forbidden");
        if (r.quantity <= 0) continue;

        const wi = await tx.warehouseInventory.findUnique({
          where: { warehouseId_productId: { warehouseId: r.warehouseId, productId: r.productId } },
          select: { quantity: true },
        });
        if (!wi || wi.quantity < r.quantity) {
          const e = new Error(`Insufficient stock to return receipt #${r.id}`);
          e.status = 409;
          throw e;
        }
        await tx.warehouseInventory.update({
          where: { warehouseId_productId: { warehouseId: r.warehouseId, productId: r.productId } },
          data: { quantity: { decrement: r.quantity } },
        });
        if (r.tagId) await decrementTrackedTagQty(tx, r.productId, r.tagId, r.quantity);
        await tx.warehouseStockReceipt.create({
          data: {
            warehouseId: r.warehouseId,
            productId: r.productId,
            tagId: r.tagId,
            quantity: -Math.abs(r.quantity),
            unitCostSnapshot: r.unitCostSnapshot,
            lineValueTotal: -Math.abs(r.lineValueTotal || r.unitCostSnapshot * r.quantity),
            supplier: r.supplier,
            note: `RETURN of #${r.id}${reason ? ` — ${reason}` : ""}`,
            receivedById: req.user.id,
            paymentStatus: "RETURNED",
            isPaid: false,
          },
        });
        await tx.warehouseStockReceipt.update({
          where: { id: r.id },
          data: { paymentStatus: "RETURNED", isPaid: false, paidAt: null },
        });
      }
    }, transactionOptions);
    res.json({ returned: ids.length });
  } catch (err) {
    console.error("[POST /purchase/warehouse-receipts/bulk-return]", err);
    res.status(err.status || 500).json({ error: err.message || "Could not return purchases" });
  }
});

async function deleteReceiptInTransaction(tx, row) {
  const wi = await tx.warehouseInventory.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: row.warehouseId,
        productId: row.productId,
      },
    },
    select: { quantity: true },
  });
  if (!wi || wi.quantity < row.quantity) {
    const e = new Error(`Cannot delete receipt #${row.id}: insufficient warehouse stock to reverse.`);
    e.status = 409;
    throw e;
  }

  await tx.warehouseInventory.update({
    where: {
      warehouseId_productId: {
        warehouseId: row.warehouseId,
        productId: row.productId,
      },
    },
    data: { quantity: { decrement: row.quantity } },
  });

  if (row.tagId) {
    await decrementTrackedTagQty(tx, row.productId, row.tagId, row.quantity);
  }

  await tx.warehouseStockReceipt.delete({ where: { id: row.id } });
}

router.post("/warehouse-receipts/bulk-delete", checkPermission("inventory.adjust"), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
  if (!ids.length) return res.status(400).json({ error: "ids is required" });

  try {
    const rows = await prisma.warehouseStockReceipt.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        warehouseId: true,
        productId: true,
        quantity: true,
        tagId: true,
      },
    });
    if (!rows.length) return res.status(404).json({ error: "No receipts found" });

    for (const r of rows) {
      // eslint-disable-next-line no-await-in-loop
      const wh = await warehouseForUserOr404(req, res, String(r.warehouseId));
      if (!wh) return;
    }

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await deleteReceiptInTransaction(tx, row);
      }
    }, transactionOptions);

    res.json({ deleted: rows.length });
  } catch (err) {
    console.error("[POST /purchase/warehouse-receipts/bulk-delete]", err);
    const status = err.status || 500;
    if (status >= 500) return res.status(500).json({ error: "Could not delete receipts" });
    return res.status(status).json({ error: err.message || "Could not delete receipts" });
  }
});

/**
 * Delete one warehouse receipt line and reverse its stock impact.
 */
router.delete(
  "/warehouse-receipts/:id",
  checkPermission("inventory.adjust"),
  async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid receipt id" });
    }

    const row = await prisma.warehouseStockReceipt.findUnique({
      where: { id },
      select: {
        id: true,
        warehouseId: true,
        productId: true,
        quantity: true,
        tagId: true,
      },
    });
    if (!row) return res.status(404).json({ error: "Receipt not found" });

    const wh = await warehouseForUserOr404(req, res, String(row.warehouseId));
    if (!wh) return;

    try {
      await prisma.$transaction(
        async (tx) => {
          await deleteReceiptInTransaction(tx, row);
        },
        transactionOptions
      );

      res.json({ message: "Receipt deleted and inventory reversed" });
    } catch (err) {
      console.error("[DELETE /purchase/warehouse-receipts/:id]", err);
      const status = err.status || 500;
      if (status >= 500) {
        return res.status(500).json({ error: "Could not delete receipt" });
      }
      return res.status(status).json({ error: err.message || "Could not delete receipt" });
    }
  }
);

module.exports = router;

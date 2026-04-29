const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

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

// GET is accessible to ADMIN and MANAGER (needed for transfers page)
router.get("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: { branch: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    res.json(warehouses);
  } catch (err) {
    console.error("Warehouse GET error:", err);
    res.status(500).json({ error: err.message || "Could not fetch warehouses" });
  }
});

router.post("/", authorize("ADMIN"), checkPermission("warehouses.create"), async (req, res) => {
  const { name, location, branchId } = req.body;
  if (!name) return res.status(400).json({ error: "Warehouse name is required" });
  try {
    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: parseInt(branchId) } });
      if (!branch) return res.status(404).json({ error: "Branch not found" });
    }
    const warehouse = await prisma.warehouse.create({
      data: { name, location: location || null, branchId: branchId ? parseInt(branchId) : null },
      include: { branch: { select: { name: true } } },
    });
    res.status(201).json(warehouse);
  } catch (err) {
    console.error("Warehouse create error:", err);
    res.status(500).json({ error: err.message || "Could not create warehouse" });
  }
});

// Isolated warehouse stock (not merged with branch retail stock until transferred)
router.get("/:id/inventory", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const wh = await warehouseForUserOr404(req, res, req.params.id);
    if (!wh) return;
    const rows = await prisma.warehouseInventory.findMany({
      where: { warehouseId: wh.id },
      include: {
        product: { select: { id: true, name: true, category: true, costPrice: true, price: true } },
      },
      orderBy: { productId: "asc" },
    });
    res.json(rows.map((r) => ({ ...r, isLowStock: r.quantity <= r.lowStockAlert })));
  } catch (err) {
    console.error("Warehouse inventory GET:", err);
    res.status(500).json({ error: "Could not load warehouse inventory" });
  }
});

router.put(
  "/:id/inventory/restock",
  authorize("ADMIN", "MANAGER"),
  checkPermission("inventory.adjust"),
  async (req, res) => {
    try {
      const wh = await warehouseForUserOr404(req, res, req.params.id);
      if (!wh) return;

      const { productId, addQuantity, supplier } = req.body;
      const pid = parseInt(productId, 10);
      const add = parseInt(addQuantity, 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ error: "Valid productId is required" });
      }
      if (!Number.isFinite(add) || add <= 0) {
        return res.status(400).json({ error: "addQuantity must be a positive integer" });
      }

      const product = await prisma.product.findUnique({ where: { id: pid } });
      if (!product) return res.status(404).json({ error: "Product not found" });
      if (!product.isActive) return res.status(400).json({ error: "Product is inactive" });

      const updated = await prisma.warehouseInventory.upsert({
        where: { warehouseId_productId: { warehouseId: wh.id, productId: pid } },
        update: {
          quantity: { increment: add },
          supplier: supplier !== undefined ? supplier || undefined : undefined,
        },
        create: { warehouseId: wh.id, productId: pid, quantity: add, supplier: supplier || undefined },
        include: {
          product: { select: { id: true, name: true, category: true, costPrice: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });
      res.json(updated);
    } catch (err) {
      console.error("Warehouse restock:", err);
      res.status(500).json({ error: "Could not receive stock into warehouse" });
    }
  }
);

router.put(
  "/:id/inventory/set",
  authorize("ADMIN", "MANAGER"),
  checkPermission("inventory.adjust"),
  async (req, res) => {
    try {
      const wh = await warehouseForUserOr404(req, res, req.params.id);
      if (!wh) return;
      const { productId, quantity, supplier } = req.body;
      const pid = parseInt(productId, 10);
      const qty = parseInt(quantity, 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ error: "Valid productId is required" });
      }
      if (!Number.isFinite(qty) || qty < 0) {
        return res.status(400).json({ error: "quantity must be a non‑negative integer" });
      }

      const found = await prisma.product.findUnique({ where: { id: pid } });
      if (!found) return res.status(404).json({ error: "Product not found" });

      const supplierPatch = supplier !== undefined ? { supplier: supplier || undefined } : {};
      const updated = await prisma.warehouseInventory.upsert({
        where: { warehouseId_productId: { warehouseId: wh.id, productId: pid } },
        update: { quantity: qty, ...supplierPatch },
        create: { warehouseId: wh.id, productId: pid, quantity: qty, supplier: supplier || undefined },
        include: {
          product: { select: { id: true, name: true, category: true, costPrice: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Could not adjust warehouse stock" });
    }
  }
);

router.put("/:id", authorize("ADMIN"), checkPermission("warehouses.edit"), async (req, res) => {
  const { name, location, branchId, isActive } = req.body;
  try {
    const warehouse = await prisma.warehouse.update({
      where: { id: parseInt(req.params.id) },
      data: { name, location, branchId: branchId ? parseInt(branchId) : null, isActive },
      include: { branch: { select: { name: true } } },
    });
    res.json(warehouse);
  } catch { res.status(500).json({ error: "Could not update warehouse" }); }
});

module.exports = router;

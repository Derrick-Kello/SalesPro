const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");
const { resolveBranchId } = require("../utils/branchScope");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const where = branchId ? { branchId } : {};

    const inventory = await prisma.branchInventory.findMany({
      where,
      include: { product: true, branch: { select: { name: true } } },
      orderBy: [{ product: { name: "asc" } }, { product: { variant: "asc" } }],
    });

    const result = inventory.map(i => ({ ...i, isLowStock: i.quantity <= i.lowStockAlert }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch inventory" });
  }
});

router.get("/low-stock", async (req, res) => {
  try {
    const branchId = resolveBranchId(req);
    const where = branchId ? { branchId } : {};
    const all = await prisma.branchInventory.findMany({ where, include: { product: true } });
    res.json(all.filter(i => i.quantity <= i.lowStockAlert));
  } catch { res.status(500).json({ error: "Could not fetch low stock items" }); }
});

router.put("/:productId/adjust", authorize("ADMIN", "MANAGER"), checkPermission("inventory.adjust"), async (req, res) => {
  const { quantity, supplier } = req.body;
  const productId = parseInt(req.params.productId);
  const branchId  = resolveBranchId(req);

  if (quantity === undefined) return res.status(400).json({ error: "Quantity is required" });
  if (!branchId) return res.status(400).json({ error: "Branch not assigned" });

  try {
    const updated = await prisma.branchInventory.update({
      where: { branchId_productId: { branchId, productId } },
      data: { quantity: parseInt(quantity), supplier: supplier || undefined },
      include: { product: true },
    });
    res.json(updated);
  } catch { res.status(500).json({ error: "Could not adjust stock" }); }
});

router.put("/:productId/restock", authorize("ADMIN", "MANAGER"), checkPermission("inventory.adjust"), async (req, res) => {
  const { addQuantity, supplier } = req.body;
  const productId = parseInt(req.params.productId);
  const branchId  = resolveBranchId(req);

  if (!addQuantity || addQuantity <= 0) return res.status(400).json({ error: "Add quantity must be positive" });
  if (!branchId) return res.status(400).json({ error: "Branch not assigned" });

  try {
    const updated = await prisma.branchInventory.update({
      where: { branchId_productId: { branchId, productId } },
      data: { quantity: { increment: parseInt(addQuantity) }, supplier: supplier || undefined },
      include: { product: true },
    });
    res.json(updated);
  } catch { res.status(500).json({ error: "Could not restock item" }); }
});

router.put("/:productId/alert", authorize("ADMIN", "MANAGER"), checkPermission("inventory.adjust"), async (req, res) => {
  const { lowStockAlert } = req.body;
  const productId = parseInt(req.params.productId);
  const branchId  = resolveBranchId(req);

  if (!branchId) return res.status(400).json({ error: "Branch not assigned" });

  try {
    const updated = await prisma.branchInventory.update({
      where: { branchId_productId: { branchId, productId } },
      data: { lowStockAlert: parseInt(lowStockAlert) },
      include: { product: true },
    });
    res.json(updated);
  } catch { res.status(500).json({ error: "Could not update alert threshold" }); }
});

module.exports = router;

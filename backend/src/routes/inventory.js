// Inventory management - stock levels, adjustments, and low stock alerts.

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

// Get all inventory records, flagging anything that's running low
router.get("/", async (req, res) => {
  try {
    const inventory = await prisma.inventory.findMany({
      include: { product: true },
      orderBy: { product: { name: "asc" } },
    });

    // Tag each item so the frontend can highlight low stock easily
    const result = inventory.map((item) => ({
      ...item,
      isLowStock: item.quantity <= item.lowStockAlert,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch inventory" });
  }
});

// Get only the items that are below their low stock threshold
router.get("/low-stock", async (req, res) => {
  try {
    const items = await prisma.inventory.findMany({
      where: {
        quantity: { lte: prisma.inventory.fields.lowStockAlert },
      },
      include: { product: true },
    });

    // Prisma doesn't support column-to-column comparisons directly, so we filter in JS
    const lowStock = await prisma.inventory.findMany({ include: { product: true } });
    const filtered = lowStock.filter((i) => i.quantity <= i.lowStockAlert);

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch low stock items" });
  }
});

// Manually adjust stock - for restocking or corrections
router.put("/:productId/adjust", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const { quantity, supplier, note } = req.body;
  const productId = parseInt(req.params.productId);

  if (quantity === undefined) {
    return res.status(400).json({ error: "Quantity is required" });
  }

  try {
    const updated = await prisma.inventory.update({
      where: { productId },
      data: {
        quantity: parseInt(quantity),
        supplier: supplier || undefined,
      },
      include: { product: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Could not adjust stock" });
  }
});

// Add stock on top of what's already there (restocking)
router.put("/:productId/restock", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const { addQuantity, supplier } = req.body;
  const productId = parseInt(req.params.productId);

  if (!addQuantity || addQuantity <= 0) {
    return res.status(400).json({ error: "Add quantity must be a positive number" });
  }

  try {
    const updated = await prisma.inventory.update({
      where: { productId },
      data: {
        quantity: { increment: parseInt(addQuantity) },
        supplier: supplier || undefined,
      },
      include: { product: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Could not restock item" });
  }
});

// Update the low stock alert threshold for a product
router.put("/:productId/alert", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const { lowStockAlert } = req.body;
  const productId = parseInt(req.params.productId);

  try {
    const updated = await prisma.inventory.update({
      where: { productId },
      data: { lowStockAlert: parseInt(lowStockAlert) },
      include: { product: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Could not update alert threshold" });
  }
});

module.exports = router;

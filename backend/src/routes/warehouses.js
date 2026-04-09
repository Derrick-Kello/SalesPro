const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

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

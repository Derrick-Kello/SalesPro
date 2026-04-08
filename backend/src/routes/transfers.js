const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, authorize("ADMIN", "MANAGER"));

router.post("/", async (req, res) => {
  const { productId, quantity, fromBranchId, fromWarehouseId, toBranchId, toWarehouseId, note } = req.body;

  if (!productId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: "productId and quantity > 0 are required" });
  }
  if (!fromBranchId && !fromWarehouseId) {
    return res.status(400).json({ error: "Source (fromBranchId or fromWarehouseId) is required" });
  }
  if (!toBranchId && !toWarehouseId) {
    return res.status(400).json({ error: "Destination (toBranchId or toWarehouseId) is required" });
  }

  const pid = parseInt(productId);
  const qty = parseInt(quantity);

  try {
    // Resolve source branchId: direct branch or via warehouse's linked branch
    let sourceBranchId = fromBranchId ? parseInt(fromBranchId) : null;
    if (!sourceBranchId && fromWarehouseId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: parseInt(fromWarehouseId) } });
      if (wh?.branchId) sourceBranchId = wh.branchId;
    }

    // Resolve destination branchId: direct branch or via warehouse's linked branch
    let destBranchId = toBranchId ? parseInt(toBranchId) : null;
    if (!destBranchId && toWarehouseId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: parseInt(toWarehouseId) } });
      if (wh?.branchId) destBranchId = wh.branchId;
    }

    // Check source inventory if we have a source branch
    if (sourceBranchId) {
      const source = await prisma.branchInventory.findUnique({
        where: { branchId_productId: { branchId: sourceBranchId, productId: pid } },
      });
      if (!source) return res.status(404).json({ error: "Product not found in source inventory" });
      if (source.quantity < qty) return res.status(400).json({ error: `Insufficient stock. Available: ${source.quantity}` });
    }

    const transfer = await prisma.$transaction(async (tx) => {
      // Decrement source inventory if source branch is known
      if (sourceBranchId) {
        await tx.branchInventory.update({
          where: { branchId_productId: { branchId: sourceBranchId, productId: pid } },
          data: { quantity: { decrement: qty } },
        });
      }

      // Increment destination inventory if destination branch is known
      if (destBranchId) {
        await tx.branchInventory.upsert({
          where: { branchId_productId: { branchId: destBranchId, productId: pid } },
          update: { quantity: { increment: qty } },
          create: { branchId: destBranchId, productId: pid, quantity: qty },
        });
      }

      return tx.stockTransfer.create({
        data: {
          productId: pid,
          quantity: qty,
          fromBranchId: sourceBranchId,
          fromWarehouseId: fromWarehouseId ? parseInt(fromWarehouseId) : null,
          toBranchId: destBranchId,
          toWarehouseId: toWarehouseId ? parseInt(toWarehouseId) : null,
          transferredById: req.user.id,
          note,
        },
        include: {
          product: { select: { name: true } },
          fromBranch: { select: { name: true } },
          toBranch: { select: { name: true } },
          fromWarehouse: { select: { name: true } },
          toWarehouse: { select: { name: true } },
          transferredBy: { select: { fullName: true } },
        },
      });
    }, { timeout: 15000 });

    res.status(201).json(transfer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Transfer failed" });
  }
});

router.get("/", async (req, res) => {
  try {
    const transfers = await prisma.stockTransfer.findMany({
      include: {
        product: { select: { name: true } },
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
        transferredBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(transfers);
  } catch { res.status(500).json({ error: "Could not fetch transfers" }); }
});

module.exports = router;

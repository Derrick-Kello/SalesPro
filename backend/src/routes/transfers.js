const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, authorize("ADMIN", "MANAGER"));

router.post("/", checkPermission("transfers.create"), async (req, res) => {
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
    // Validate product exists and is active
    const product = await prisma.product.findUnique({ where: { id: pid } });
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (!product.isActive) return res.status(400).json({ error: "Cannot transfer an inactive product" });

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

    // Check source inventory — try branchInventory first, fall back to global
    if (sourceBranchId) {
      const source = await prisma.branchInventory.findUnique({
        where: { branchId_productId: { branchId: sourceBranchId, productId: pid } },
      });
      if (!source) {
        const globalInv = await prisma.inventory.findUnique({ where: { productId: pid } });
        if (!globalInv || globalInv.quantity < qty) {
          return res.status(400).json({ error: `Insufficient stock for ${product.name}. Not found in source branch.` });
        }
        // Auto-create branchInventory from global stock so the decrement works
        await prisma.branchInventory.create({
          data: { branchId: sourceBranchId, productId: pid, quantity: globalInv.quantity },
        });
      } else if (source.quantity < qty) {
        return res.status(400).json({ error: `Insufficient stock. Available: ${source.quantity}` });
      }
    }

    // Capture prices at time of transfer for accounting
    const transferCostPrice = product.costPrice || 0;
    const transferUnitPrice = product.price || 0;
    const transferTotalValue = transferCostPrice * qty;

    const transfer = await prisma.$transaction(async (tx) => {
      // Decrement source inventory
      if (sourceBranchId) {
        await tx.branchInventory.update({
          where: { branchId_productId: { branchId: sourceBranchId, productId: pid } },
          data: { quantity: { decrement: qty } },
        });
      }

      // Increment destination inventory (creates record if product is new to that branch)
      if (destBranchId) {
        await tx.branchInventory.upsert({
          where: { branchId_productId: { branchId: destBranchId, productId: pid } },
          update: { quantity: { increment: qty } },
          create: { branchId: destBranchId, productId: pid, quantity: qty },
        });

        // Link product to the destination branch so it shows up in their product list
        await tx.product.update({
          where: { id: pid },
          data: { branches: { connect: { id: destBranchId } } },
        }).catch(() => {});
      }

      return tx.stockTransfer.create({
        data: {
          productId: pid,
          quantity: qty,
          costPrice: transferCostPrice,
          unitPrice: transferUnitPrice,
          totalValue: transferTotalValue,
          fromBranchId: sourceBranchId,
          fromWarehouseId: fromWarehouseId ? parseInt(fromWarehouseId) : null,
          toBranchId: destBranchId,
          toWarehouseId: toWarehouseId ? parseInt(toWarehouseId) : null,
          transferredById: req.user.id,
          note,
        },
        include: {
          product: { select: { name: true, costPrice: true, price: true } },
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
        product: { select: { name: true, costPrice: true, price: true } },
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

// Delete a transfer record and reverse the inventory changes
router.delete("/:id", authorize("ADMIN"), checkPermission("transfers.delete"), async (req, res) => {
  try {
    const transfer = await prisma.stockTransfer.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!transfer) return res.status(404).json({ error: "Transfer not found" });

    await prisma.$transaction(async (tx) => {
      // Restore stock to source branch
      if (transfer.fromBranchId) {
        await tx.branchInventory.upsert({
          where: { branchId_productId: { branchId: transfer.fromBranchId, productId: transfer.productId } },
          update: { quantity: { increment: transfer.quantity } },
          create: { branchId: transfer.fromBranchId, productId: transfer.productId, quantity: transfer.quantity },
        });
      }
      // Remove stock from destination branch
      if (transfer.toBranchId) {
        const destInv = await tx.branchInventory.findUnique({
          where: { branchId_productId: { branchId: transfer.toBranchId, productId: transfer.productId } },
        });
        if (destInv) {
          const newQty = Math.max(0, destInv.quantity - transfer.quantity);
          await tx.branchInventory.update({
            where: { branchId_productId: { branchId: transfer.toBranchId, productId: transfer.productId } },
            data: { quantity: newQty },
          });
        }
      }
      await tx.stockTransfer.delete({ where: { id: transfer.id } });
    }, { timeout: 15000 });

    res.json({ message: "Transfer deleted and inventory reversed" });
  } catch (err) {
    console.error("[DELETE /transfers/:id]", err.message);
    res.status(500).json({ error: "Could not delete transfer" });
  }
});

module.exports = router;

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, authorize("ADMIN", "MANAGER"));

class ClientTransferError extends Error {
  constructor({ http = 400, message }) {
    super(message);
    this.http = http;
  }
}

router.post("/", checkPermission("transfers.create"), async (req, res) => {
  const { productId, quantity, fromBranchId, fromWarehouseId, toBranchId, toWarehouseId, note } =
    req.body;

  const pid = parseInt(productId, 10);
  const qty = parseInt(quantity, 10);
  if (!Number.isFinite(pid) || !productId) {
    return res.status(400).json({ error: "productId is required" });
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: "quantity must be a positive integer" });
  }

  const fromBr =
    fromBranchId != null && fromBranchId !== "" ? parseInt(fromBranchId, 10) : null;
  const fromWh =
    fromWarehouseId != null && fromWarehouseId !== "" ? parseInt(fromWarehouseId, 10) : null;
  const toBr = toBranchId != null && toBranchId !== "" ? parseInt(toBranchId, 10) : null;
  const toWh = toWarehouseId != null && toWarehouseId !== "" ? parseInt(toWarehouseId, 10) : null;

  const hasFromBr = Number.isFinite(fromBr);
  const hasFromWh = Number.isFinite(fromWh);
  if ((hasFromBr && hasFromWh) || (!hasFromBr && !hasFromWh)) {
    return res.status(400).json({
      error:
        "Exactly one source location is required — choose either branch stock or warehouse stock (not both).",
    });
  }
  const hasToBr = Number.isFinite(toBr);
  const hasToWh = Number.isFinite(toWh);
  if ((hasToBr && hasToWh) || (!hasToBr && !hasToWh)) {
    return res.status(400).json({
      error:
        "Exactly one destination location is required — choose either branch or warehouse (not both).",
    });
  }
  if (hasFromWh && hasToWh && fromWh === toWh) {
    return res.status(400).json({ error: "Source and destination cannot be the same warehouse" });
  }
  if (hasFromBr && hasToBr && fromBr === toBr) {
    return res.status(400).json({ error: "Source and destination branches must be different" });
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: pid } });
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (!product.isActive) return res.status(400).json({ error: "Cannot transfer an inactive product" });

    const transferCostPrice = product.costPrice || 0;
    const transferUnitPrice = product.price || 0;
    const transferTotalValue = transferCostPrice * qty;

    const transfer = await prisma.$transaction(
      async (tx) => {
        if (hasFromWh) {
          const wi = await tx.warehouseInventory.findUnique({
            where: { warehouseId_productId: { warehouseId: fromWh, productId: pid } },
          });
          const available = wi?.quantity ?? 0;
          if (!wi || wi.quantity < qty) {
            throw new ClientTransferError({
              message: `Insufficient warehouse stock for ${product.name}. Available: ${available}.`,
            });
          }
          await tx.warehouseInventory.update({
            where: { warehouseId_productId: { warehouseId: fromWh, productId: pid } },
            data: { quantity: { decrement: qty } },
          });
        } else {
          const branchId = fromBr;
          let bi = await tx.branchInventory.findUnique({
            where: { branchId_productId: { branchId, productId: pid } },
          });
          if (!bi) {
            const globalInv = await tx.inventory.findUnique({ where: { productId: pid } });
            if (!globalInv || globalInv.quantity < qty) {
              throw new ClientTransferError({
                message: `Insufficient stock for ${product.name} at the source branch.`,
              });
            }
            bi = await tx.branchInventory.create({
              data: { branchId, productId: pid, quantity: globalInv.quantity },
            });
          }
          if (bi.quantity < qty) {
            throw new ClientTransferError({
              message: `Insufficient branch stock for ${product.name}. Available: ${bi.quantity}.`,
            });
          }
          await tx.branchInventory.update({
            where: { branchId_productId: { branchId, productId: pid } },
            data: { quantity: { decrement: qty } },
          });
        }

        if (hasToWh) {
          await tx.warehouseInventory.upsert({
            where: {
              warehouseId_productId: { warehouseId: toWh, productId: pid },
            },
            update: { quantity: { increment: qty } },
            create: { warehouseId: toWh, productId: pid, quantity: qty },
          });
        } else {
          await tx.branchInventory.upsert({
            where: { branchId_productId: { branchId: toBr, productId: pid } },
            update: { quantity: { increment: qty } },
            create: { branchId: toBr, productId: pid, quantity: qty },
          });
          await tx.product.update({
            where: { id: pid },
            data: { branches: { connect: { id: toBr } } },
          }).catch(() => {});
        }

        return tx.stockTransfer.create({
          data: {
            productId: pid,
            quantity: qty,
            costPrice: transferCostPrice,
            unitPrice: transferUnitPrice,
            totalValue: transferTotalValue,
            fromBranchId: hasFromBr ? fromBr : null,
            fromWarehouseId: hasFromWh ? fromWh : null,
            toBranchId: hasToBr ? toBr : null,
            toWarehouseId: hasToWh ? toWh : null,
            transferredById: req.user.id,
            note,
          },
          include: {
            product: { select: { name: true, variant: true, costPrice: true, price: true } },
            fromBranch: { select: { name: true } },
            toBranch: { select: { name: true } },
            fromWarehouse: { select: { name: true } },
            toWarehouse: { select: { name: true } },
            transferredBy: { select: { fullName: true } },
          },
        });
      },
      { timeout: 15000 }
    );

    res.status(201).json(transfer);
  } catch (err) {
    if (err instanceof ClientTransferError) {
      return res.status(err.http ?? 400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Transfer failed" });
  }
});

router.get("/", async (req, res) => {
  try {
    const transfers = await prisma.stockTransfer.findMany({
      include: {
        product: { select: { name: true, variant: true, costPrice: true, price: true } },
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
        transferredBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(transfers);
  } catch {
    res.status(500).json({ error: "Could not fetch transfers" });
  }
});

router.delete("/:id", authorize("ADMIN"), checkPermission("transfers.delete"), async (req, res) => {
  try {
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: parseInt(req.params.id, 10) },
    });
    if (!transfer) return res.status(404).json({ error: "Transfer not found" });

    await prisma.$transaction(
      async (tx) => {
        const pid = transfer.productId;
        const qty = transfer.quantity;

        // Put stock back where it came from (reverse source decrement)
        if (transfer.fromWarehouseId) {
          await tx.warehouseInventory.upsert({
            where: {
              warehouseId_productId: { warehouseId: transfer.fromWarehouseId, productId: pid },
            },
            update: { quantity: { increment: qty } },
            create: { warehouseId: transfer.fromWarehouseId, productId: pid, quantity: qty },
          });
        }
        if (transfer.fromBranchId) {
          await tx.branchInventory.upsert({
            where: {
              branchId_productId: { branchId: transfer.fromBranchId, productId: pid },
            },
            update: { quantity: { increment: qty } },
            create: { branchId: transfer.fromBranchId, productId: pid, quantity: qty },
          });
        }

        // Remove goods that landed at destination (reverse destination increment)
        if (transfer.toWarehouseId) {
          const destWi = await tx.warehouseInventory.findUnique({
            where: {
              warehouseId_productId: { warehouseId: transfer.toWarehouseId, productId: pid },
            },
          });
          if (destWi) {
            const newQty = Math.max(0, destWi.quantity - qty);
            await tx.warehouseInventory.update({
              where: {
                warehouseId_productId: { warehouseId: transfer.toWarehouseId, productId: pid },
              },
              data: { quantity: newQty },
            });
          }
        }
        if (transfer.toBranchId) {
          const destInv = await tx.branchInventory.findUnique({
            where: {
              branchId_productId: { branchId: transfer.toBranchId, productId: pid },
            },
          });
          if (destInv) {
            const newQty = Math.max(0, destInv.quantity - qty);
            await tx.branchInventory.update({
              where: {
                branchId_productId: { branchId: transfer.toBranchId, productId: pid },
              },
              data: { quantity: newQty },
            });
          }
        }

        await tx.stockTransfer.delete({ where: { id: transfer.id } });
      },
      { timeout: 15000 }
    );

    res.json({ message: "Transfer deleted and inventory reversed" });
  } catch (err) {
    console.error("[DELETE /transfers/:id]", err.message);
    res.status(500).json({ error: "Could not delete transfer" });
  }
});

module.exports = router;

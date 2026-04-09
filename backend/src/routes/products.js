// Product management - add, update, delete, and search products.

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

// Get all active products, with their current stock levels
// Pass ?branchId=X to filter products assigned to a specific branch
router.get("/", async (req, res) => {
  try {
    const { search, category, branchId } = req.query;

    const conditions = [{ isActive: true }];
    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } },
          { category: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (category) conditions.push({ category: { equals: category, mode: "insensitive" } });
    // Show products assigned to this branch OR products with no branch restriction (available everywhere)
    if (branchId) {
      conditions.push({
        OR: [
          { branches: { some: { id: parseInt(branchId) } } },
          { branches: { none: {} } },
        ],
      });
    }
    const where = conditions.length === 1 ? conditions[0] : { AND: conditions };

    const products = await prisma.product.findMany({
      where,
      include: {
        inventory: true,
        branches: { select: { id: true, name: true } },
        ...(branchId
          ? {
              branchInventory: {
                where: { branchId: parseInt(branchId) },
              },
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    res.json(products);
  } catch (err) {
    console.error("[GET /products]", err.message);
    res.status(500).json({ error: "Could not fetch products" });
  }
});

// Look up a product by its barcode - used when scanning at the register
router.get("/barcode/:barcode", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { barcode: req.params.barcode },
      include: { inventory: true, branches: { select: { id: true, name: true } } },
    });
    if (!product || !product.isActive) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Barcode lookup failed" });
  }
});

// Get a single product by ID
router.get("/:id", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { inventory: true, branches: { select: { id: true, name: true } } },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch product" });
  }
});

// Add a new product - only managers and admins
router.post("/", authorize("ADMIN", "MANAGER"), checkPermission("products.create"), async (req, res) => {
  const { name, category, price, costPrice, barcode, description, quantity, lowStockAlert, supplier, branchIds } = req.body;

  if (!name || !category || !price || costPrice === undefined || costPrice === "" || costPrice === null) {
    return res.status(400).json({ error: "Name, category, selling price, and cost price are required" });
  }

  try {
    const product = await prisma.product.create({
      data: {
        name,
        category,
        price: parseFloat(price),
        costPrice: parseFloat(costPrice),
        barcode,
        description,
        inventory: {
          create: {
            quantity: parseInt(quantity) || 0,
            lowStockAlert: parseInt(lowStockAlert) || 10,
            supplier,
          },
        },
        branches: branchIds?.length
          ? { connect: branchIds.map((id) => ({ id: parseInt(id) })) }
          : undefined,
      },
      include: { inventory: true, branches: { select: { id: true, name: true } } },
    });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "A product with that barcode already exists" });
    }
    res.status(500).json({ error: "Could not create product" });
  }
});

// Update product details
router.put("/:id", authorize("ADMIN", "MANAGER"), checkPermission("products.edit"), async (req, res) => {
  const { name, category, price, costPrice, barcode, description, branchIds } = req.body;
  const id = parseInt(req.params.id);

  if (!name || !category || !price || costPrice === undefined || costPrice === "" || costPrice === null) {
    return res.status(400).json({ error: "Name, category, selling price, and cost price are required" });
  }

  try {
    const data = {
      name,
      category,
      price: parseFloat(price),
      costPrice: parseFloat(costPrice),
      barcode,
      description,
    };
    // If branchIds is provided, replace the full set
    if (Array.isArray(branchIds)) {
      data.branches = { set: branchIds.map((bid) => ({ id: parseInt(bid) })) };
    }
    const product = await prisma.product.update({
      where: { id },
      data,
      include: { inventory: true, branches: { select: { id: true, name: true } } },
    });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Could not update product" });
  }
});

// Soft delete - we mark it inactive rather than removing it from the database
router.delete("/:id", authorize("ADMIN", "MANAGER"), checkPermission("products.delete"), async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data: { isActive: false },
    });
    res.json({ message: "Product removed" });
  } catch (err) {
    res.status(500).json({ error: "Could not remove product" });
  }
});

// Get all unique categories for the filter dropdown
router.get("/meta/categories", async (req, res) => {
  try {
    const categories = await prisma.product.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    res.json(categories.map((c) => c.category));
  } catch (err) {
    res.status(500).json({ error: "Could not fetch categories" });
  }
});

module.exports = router;

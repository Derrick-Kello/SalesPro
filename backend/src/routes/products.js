// Product management - add, update, delete, and search products.

const express = require("express");
const prisma = require("../prisma/client");
const transactionOptions = require("../prisma/transactionOptions");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");
const { syncProductTags } = require("../utils/tagHelpers");

function sanitizeBranchIds(branchIds) {
  if (!Array.isArray(branchIds)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of branchIds) {
    const n = parseInt(raw, 10);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function sanitizeBarcode(barcode) {
  if (barcode == null) return null;
  const t = String(barcode).trim();
  return t === "" ? null : t;
}

const router = express.Router();

router.use(authenticate);

const productInclude = {
  inventory: true,
  branches: { select: { id: true, name: true } },
  productTags: { include: { tag: { select: { id: true, name: true, group: true } } } },
};

function mapProduct(p) {
  if (!p) return p;
  const { productTags: pts, ...rest } = p;
  return {
    ...rest,
    tags: (pts || []).map((pt) => ({
      id: pt.tag.id,
      name: pt.tag.name,
      group: pt.tag.group,
      quantity: pt.quantity,
      productTagId: pt.id,
    })),
  };
}

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
          { variant: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } },
          { category: { contains: search, mode: "insensitive" } },
          {
            productTags: {
              some: { tag: { name: { contains: search, mode: "insensitive" } } },
            },
          },
        ],
      });
    }
    if (category) conditions.push({ category: { equals: category, mode: "insensitive" } });
    if (branchId) {
      const bid = parseInt(branchId, 10);
      conditions.push({
        branchInventory: {
          some: {
            branchId: bid,
            quantity: { gt: 0 },
          },
        },
      });
    }
    const where = conditions.length === 1 ? conditions[0] : { AND: conditions };

    const products = await prisma.product.findMany({
      where,
      include: {
        ...productInclude,
        ...(branchId
          ? {
              branchInventory: {
                where: { branchId: parseInt(branchId) },
              },
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { variant: "asc" }],
    });
    res.json(products.map(mapProduct));
  } catch (err) {
    console.error("[GET /products]", err.message);
    res.status(500).json({ error: "Could not fetch products" });
  }
});

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

// Look up by barcode BEFORE /:id wildcard
router.get("/barcode/:barcode", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { barcode: req.params.barcode },
      include: productInclude,
    });
    if (!product || !product.isActive) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(mapProduct(product));
  } catch (err) {
    res.status(500).json({ error: "Barcode lookup failed" });
  }
});

// Get a single product by ID
router.get("/:id", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
      include: productInclude,
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(mapProduct(product));
  } catch (err) {
    res.status(500).json({ error: "Could not fetch product" });
  }
});

// Add a new product - only managers and admins
router.post("/", authorize("ADMIN", "MANAGER"), checkPermission("products.create"), async (req, res) => {
  const {
    name,
    category,
    price,
    costPrice,
    barcode,
    description,
    quantity,
    lowStockAlert,
    supplier,
    branchIds,
    tags,
  } = req.body;

  const nameTrim = name != null ? String(name).trim() : "";
  const catTrim = category != null ? String(category).trim() : "";

  if (!nameTrim || !catTrim || price === undefined || price === "" || costPrice === undefined || costPrice === "" || costPrice === null) {
    return res.status(400).json({ error: "Name, category, selling price, and cost price are required" });
  }

  const priceNum = parseFloat(price);
  const costNum = parseFloat(costPrice);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: "Invalid selling price" });
  }
  if (!Number.isFinite(costNum) || costNum < 0) {
    return res.status(400).json({ error: "Invalid cost price" });
  }

  const qtyParsed = parseInt(String(quantity ?? "0"), 10);
  const qty = Number.isFinite(qtyParsed) ? Math.max(0, qtyParsed) : 0;
  const lowParsed = parseInt(String(lowStockAlert ?? "10"), 10);
  const low = Number.isFinite(lowParsed) && lowParsed >= 0 ? lowParsed : 10;

  const barcodeClean = sanitizeBarcode(barcode);
  const bids = sanitizeBranchIds(branchIds);

  try {
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: nameTrim,
          variant: "Standard",
          category: catTrim,
          price: priceNum,
          costPrice: costNum,
          barcode: barcodeClean,
          description: description != null ? String(description) : "",
          inventory: {
            create: {
              quantity: qty,
              lowStockAlert: low,
              supplier:
                supplier != null && String(supplier).trim() !== ""
                  ? String(supplier).trim()
                  : null,
            },
          },
          branches: bids.length ? { connect: bids.map((id) => ({ id })) } : undefined,
          createdById: req.user.id,
        },
      });
      await syncProductTags(tx, p.id, tags);
      return tx.product.findUnique({
        where: { id: p.id },
        include: productInclude,
      });
    }, transactionOptions);
    res.status(201).json(mapProduct(product));
  } catch (err) {
    console.error("[POST /products]", err);
    if (err.code === "P2002") {
      const tgt = err.meta?.target;
      const isBarcode = Array.isArray(tgt)
        ? tgt.includes("barcode") || tgt.some((x) => String(x).includes("barcode"))
        : typeof tgt === "string" && tgt.includes("barcode");
      return res.status(409).json({
        error: isBarcode ? "A product with that barcode already exists" : "Unique constraint violation",
      });
    }
    res.status(500).json({
      error: err.message || "Could not create product",
    });
  }
});

// Update product details
router.put("/:id", authorize("ADMIN", "MANAGER"), checkPermission("products.edit"), async (req, res) => {
  const { name, category, price, costPrice, barcode, description, branchIds, tags } = req.body;
  const id = parseInt(req.params.id, 10);

  const nameTrim = name != null ? String(name).trim() : "";
  const catTrim = category != null ? String(category).trim() : "";

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !nameTrim ||
    !catTrim ||
    price === undefined ||
    price === "" ||
    costPrice === undefined ||
    costPrice === "" ||
    costPrice === null
  ) {
    return res.status(400).json({ error: "Name, category, selling price, and cost price are required" });
  }

  const priceNum = parseFloat(price);
  const costNum = parseFloat(costPrice);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: "Invalid selling price" });
  }
  if (!Number.isFinite(costNum) || costNum < 0) {
    return res.status(400).json({ error: "Invalid cost price" });
  }

  const barcodeClean = sanitizeBarcode(barcode);

  try {
    const product = await prisma.$transaction(async (tx) => {
      const data = {
        name: nameTrim,
        variant: "Standard",
        category: catTrim,
        price: priceNum,
        costPrice: costNum,
        barcode: barcodeClean,
        description: description != null ? String(description) : "",
      };
      if (Array.isArray(branchIds)) {
        const bids = sanitizeBranchIds(branchIds);
        data.branches = { set: bids.map((bid) => ({ id: bid })) };
      }
      await tx.product.update({ where: { id }, data });
      if (tags !== undefined) {
        await syncProductTags(tx, id, tags);
      }
      return tx.product.findUnique({
        where: { id },
        include: productInclude,
      });
    }, transactionOptions);
    res.json(mapProduct(product));
  } catch (err) {
    console.error("[PUT /products/:id]", err);
    if (err.code === "P2002") {
      const tgt = err.meta?.target;
      const isBarcode = Array.isArray(tgt)
        ? tgt.includes("barcode") || tgt.some((x) => String(x).includes("barcode"))
        : typeof tgt === "string" && tgt.includes("barcode");
      return res.status(409).json({
        error: isBarcode ? "A product with that barcode already exists" : "Unique constraint violation",
      });
    }
    res.status(500).json({
      error: err.message || "Could not update product",
    });
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

module.exports = router;

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");
const { resolveBranchId } = require("../utils/branchScope");

const router = express.Router();
router.use(authenticate);

// Categories
router.get("/categories", async (req, res) => {
  try {
    const cats = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
    res.json(cats);
  } catch { res.status(500).json({ error: "Could not fetch categories" }); }
});

router.post("/categories", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  try {
    const cat = await prisma.expenseCategory.create({ data: { name } });
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "Category already exists" });
    res.status(500).json({ error: "Could not create category" });
  }
});

router.delete("/categories/:id", authorize("ADMIN"), async (req, res) => {
  try {
    await prisma.expenseCategory.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Category deleted" });
  } catch { res.status(500).json({ error: "Could not delete category" }); }
});

// Expenses
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, categoryId } = req.query;
    const branchId = resolveBranchId(req);
    const where = {};
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (branchId) where.branchId = branchId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) { const e = new Date(endDate); e.setHours(23,59,59,999); where.date.lte = e; }
    }
    const expenses = await prisma.expense.findMany({
      where,
      include: {
        category: true,
        branch: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    });
    res.json(expenses);
  } catch { res.status(500).json({ error: "Could not fetch expenses" }); }
});

router.post("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const { title, amount, categoryId, note, date, branchId: bodyBranchId } = req.body;
  if (!title || !amount || !categoryId) return res.status(400).json({ error: "Title, amount and category are required" });

  // ADMIN can specify branchId in body; others use their own branchId
  const branchId = req.user.role === "ADMIN"
    ? (bodyBranchId ? parseInt(bodyBranchId) : (req.user.branchId ?? null))
    : (req.user.branchId ?? null);

  try {
    const expense = await prisma.expense.create({
      data: {
        title,
        amount: parseFloat(amount),
        categoryId: parseInt(categoryId),
        note,
        date: date ? new Date(date) : new Date(),
        branchId,
      },
      include: {
        category: true,
        branch: { select: { name: true } },
      },
    });
    res.status(201).json(expense);
  } catch { res.status(500).json({ error: "Could not create expense" }); }
});

router.put("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const { title, amount, categoryId, note, date } = req.body;
  try {
    const expense = await prisma.expense.update({
      where: { id: parseInt(req.params.id) },
      data: {
        title,
        amount: amount ? parseFloat(amount) : undefined,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        note,
        date: date ? new Date(date) : undefined,
      },
      include: {
        category: true,
        branch: { select: { name: true } },
      },
    });
    res.json(expense);
  } catch { res.status(500).json({ error: "Could not update expense" }); }
});

router.delete("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    await prisma.expense.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Expense deleted" });
  } catch { res.status(500).json({ error: "Could not delete expense" }); }
});

module.exports = router;

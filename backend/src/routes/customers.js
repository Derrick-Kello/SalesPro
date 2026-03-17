// Customer management - register customers and track their purchase history.

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

// Get all customers
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch customers" });
  }
});

// Get a single customer with their full purchase history
router.get("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        sales: {
          include: { payment: true, saleItems: { include: { product: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch customer" });
  }
});

// Register a new customer
router.post("/", async (req, res) => {
  const { name, phone, email, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Customer name is required" });
  }

  try {
    const customer = await prisma.customer.create({
      data: { name, phone, email, address },
    });
    res.status(201).json(customer);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "A customer with that phone or email already exists" });
    }
    res.status(500).json({ error: "Could not register customer" });
  }
});

// Update customer details
router.put("/:id", async (req, res) => {
  const { name, phone, email, address } = req.body;
  const id = parseInt(req.params.id);

  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: { name, phone, email, address },
    });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: "Could not update customer" });
  }
});

// Delete a customer record - admin only
router.delete("/:id", authorize("ADMIN"), async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Customer deleted" });
  } catch (err) {
    res.status(500).json({ error: "Could not delete customer" });
  }
});

module.exports = router;

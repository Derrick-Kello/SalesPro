const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    res.json(suppliers);
  } catch { res.status(500).json({ error: "Could not fetch suppliers" }); }
});

router.post("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const { name, phone, email, address, company } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  try {
    const supplier = await prisma.supplier.create({ data: { name, phone, email, address, company } });
    res.status(201).json(supplier);
  } catch { res.status(500).json({ error: "Could not create supplier" }); }
});

router.put("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {
  const { name, phone, email, address, company } = req.body;
  try {
    const supplier = await prisma.supplier.update({ where: { id: parseInt(req.params.id) }, data: { name, phone, email, address, company } });
    res.json(supplier);
  } catch { res.status(500).json({ error: "Could not update supplier" }); }
});

router.delete("/:id", authorize("ADMIN"), async (req, res) => {
  try {
    await prisma.supplier.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
    res.json({ message: "Supplier removed" });
  } catch { res.status(500).json({ error: "Could not remove supplier" }); }
});

module.exports = router;

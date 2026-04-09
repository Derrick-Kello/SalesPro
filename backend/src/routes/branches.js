const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

// GET is accessible to ADMIN and MANAGER (needed for transfers page)
router.get("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({ orderBy: { name: "asc" } });
    res.json(branches);
  } catch { res.status(500).json({ error: "Could not fetch branches" }); }
});

router.post("/", authorize("ADMIN"), checkPermission("branches.create"), async (req, res) => {
  const { name, location, phone } = req.body;
  if (!name) return res.status(400).json({ error: "Branch name is required" });
  try {
    const branch = await prisma.branch.create({ data: { name, location, phone } });
    res.status(201).json(branch);
  } catch { res.status(500).json({ error: "Could not create branch" }); }
});

router.put("/:id", authorize("ADMIN"), checkPermission("branches.edit"), async (req, res) => {
  const { name, location, phone, isActive } = req.body;
  try {
    const branch = await prisma.branch.update({
      where: { id: parseInt(req.params.id) },
      data: { name, location, phone, isActive },
    });
    res.json(branch);
  } catch { res.status(500).json({ error: "Could not update branch" }); }
});

router.delete("/:id", authorize("ADMIN"), checkPermission("branches.deactivate"), async (req, res) => {
  try {
    await prisma.branch.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
    res.json({ message: "Branch deactivated" });
  } catch { res.status(500).json({ error: "Could not deactivate branch" }); }
});

module.exports = router;

// Tag dictionary for products / POS filters

const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize, checkPermission } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    res.json(tags);
  } catch (err) {
    console.error("[GET /tags]", err.message);
    res.status(500).json({ error: "Could not fetch tags" });
  }
});

router.post(
  "/",
  authorize("ADMIN", "MANAGER"),
  checkPermission("products.create"),
  async (req, res) => {
    const name = req.body?.name != null ? String(req.body.name).trim() : "";
    const group = req.body?.group != null ? String(req.body.group).trim() : null;

    if (!name) return res.status(400).json({ error: "Tag name is required" });

    try {
      const tag = await prisma.tag.upsert({
        where: { name },
        create: { name, group: group || undefined, createdById: req.user.id },
        update: group ? { group } : {},
      });
      res.status(201).json(tag);
    } catch (err) {
      console.error("[POST /tags]", err.message);
      res.status(500).json({ error: "Could not save tag" });
    }
  }
);

module.exports = router;

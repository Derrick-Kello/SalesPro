// User management - only admins can create, update, or deactivate users.

const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// All user management routes require authentication
router.use(authenticate);

// Get all users - managers and admins can see this
router.get("/", authorize("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch users" });
  }
});

// Create a new user account
router.post("/", authorize("ADMIN"), async (req, res) => {
  const { username, password, fullName, role } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ error: "Username, password, and full name are required" });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashed, fullName, role: role || "CASHIER" },
      select: { id: true, username: true, fullName: true, role: true },
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: "Could not create user" });
  }
});

// Update a users details or reset their password
router.put("/:id", authorize("ADMIN"), async (req, res) => {
  const { fullName, role, password, isActive } = req.body;
  const id = parseInt(req.params.id);

  try {
    const data = {};
    if (fullName) data.fullName = fullName;
    if (role) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;
    if (password) data.password = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Could not update user" });
  }
});

// Deactivate a user instead of deleting them - keeps the history intact
router.delete("/:id", authorize("ADMIN"), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    res.json({ message: "User deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Could not deactivate user" });
  }
});

module.exports = router;

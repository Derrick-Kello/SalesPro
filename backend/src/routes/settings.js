const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, authorize } = require("../middleware/auth");
const { PERMISSION_GROUPS, ALL_KEYS, ROLE_DEFAULTS } = require("../permissions");

const router = express.Router();
router.use(authenticate);

const BUILT_IN_ROLES = ["ADMIN", "MANAGER", "CASHIER"];

// ── Caching ──────────────────────────────────────────────────────────────────
let permCache = null;
let permCacheTime = 0;
const CACHE_TTL = 30_000;

async function loadRolePerms() {
  if (permCache && Date.now() - permCacheTime < CACHE_TTL) return permCache;

  const rows = await prisma.settings.findMany({
    where: { key: { startsWith: "permissions." } },
  });

  const customRoleRows = await prisma.settings.findMany({
    where: { key: { startsWith: "customrole." } },
  });

  const stored = {};
  for (const row of rows) {
    try { stored[row.key] = JSON.parse(row.value); } catch { stored[row.key] = {}; }
  }

  const result = { roles: {}, users: {}, customRoles: {} };

  // Built-in role permissions (merge defaults with stored overrides)
  for (const role of Object.keys(ROLE_DEFAULTS)) {
    result.roles[role] = { ...ROLE_DEFAULTS[role] };
    const key = `permissions.${role}`;
    if (stored[key]) {
      for (const k of ALL_KEYS) {
        if (k in stored[key]) result.roles[role][k] = stored[key][k];
      }
    }
  }

  // Custom roles
  for (const row of customRoleRows) {
    try {
      const def = JSON.parse(row.value);
      const roleKey = row.key.replace("customrole.", "");
      result.customRoles[roleKey] = def;
      // Also put custom role permissions into the roles map for unified lookups
      if (def.permissions) {
        result.roles[roleKey] = {};
        for (const k of ALL_KEYS) {
          result.roles[roleKey][k] = !!def.permissions[k];
        }
      }
    } catch {}
  }

  // Per-user overrides
  for (const [key, val] of Object.entries(stored)) {
    const m = key.match(/^permissions\.user\.(\d+)$/);
    if (m) result.users[m[1]] = val;
  }

  permCache = result;
  permCacheTime = Date.now();
  return result;
}

function invalidateCache() {
  permCache = null;
  permCacheTime = 0;
}

// Resolve effective permissions for a specific user
async function effectivePermsForUser(userId, userRole) {
  if (userRole === "ADMIN") {
    const all = {};
    for (const k of ALL_KEYS) all[k] = true;
    return all;
  }
  const data = await loadRolePerms();
  // Check built-in roles first, then custom roles
  const rolePerms = data.roles[userRole] || ROLE_DEFAULTS[userRole] || {};
  const userOverrides = data.users[String(userId)];
  if (!userOverrides) return { ...rolePerms };
  const merged = { ...rolePerms };
  for (const k of ALL_KEYS) {
    if (k in userOverrides) merged[k] = userOverrides[k];
  }
  return merged;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Full permission matrix + user list (admin only)
router.get("/permissions", authorize("ADMIN"), async (req, res) => {
  try {
    const [data, users, branches] = await Promise.all([
      loadRolePerms(),
      prisma.user.findMany({
        select: { id: true, username: true, fullName: true, role: true, isActive: true, branchId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);
    res.json({
      groups: PERMISSION_GROUPS,
      roles: data.roles,
      userOverrides: data.users,
      users,
      branches,
      customRoles: data.customRoles,
    });
  } catch (err) {
    console.error("[GET /settings/permissions]", err.message);
    res.status(500).json({ error: "Could not load permissions" });
  }
});

// Effective permissions for the logged-in user
router.get("/permissions/mine", async (req, res) => {
  try {
    const perms = await effectivePermsForUser(req.user.id, req.user.role);
    res.json(perms);
  } catch (err) {
    console.error("[GET /settings/permissions/mine]", err.message);
    res.status(500).json({ error: "Could not load permissions" });
  }
});

// Get effective permissions for a specific user (admin)
router.get("/permissions/user/:id", authorize("ADMIN"), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { id: true, role: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    const data = await loadRolePerms();
    const rolePerms = data.roles[user.role] || ROLE_DEFAULTS[user.role] || {};
    const userOverrides = data.users[String(user.id)] || null;
    res.json({ roleDefaults: rolePerms, userOverrides });
  } catch (err) {
    console.error("[GET /settings/permissions/user/:id]", err.message);
    res.status(500).json({ error: "Could not load user permissions" });
  }
});

// Save role-level permissions for built-in roles (admin)
router.put("/permissions", authorize("ADMIN"), async (req, res) => {
  const { role, permissions } = req.body;
  if (!role || !permissions || !ROLE_DEFAULTS[role]) {
    return res.status(400).json({ error: "Valid built-in role and permissions object required" });
  }
  const clean = {};
  for (const key of ALL_KEYS) clean[key] = !!permissions[key];
  try {
    await prisma.settings.upsert({
      where: { key: `permissions.${role}` },
      update: { value: JSON.stringify(clean) },
      create: { key: `permissions.${role}`, value: JSON.stringify(clean) },
    });
    invalidateCache();
    res.json({ message: "Permissions updated", role, permissions: clean });
  } catch (err) {
    console.error("[PUT /settings/permissions]", err.message);
    res.status(500).json({ error: "Could not save permissions" });
  }
});

// Save per-user permission overrides (admin)
router.put("/permissions/user/:id", authorize("ADMIN"), async (req, res) => {
  const userId = parseInt(req.params.id);
  const { permissions } = req.body;
  if (!permissions) return res.status(400).json({ error: "Permissions object required" });

  const clean = {};
  for (const key of ALL_KEYS) {
    if (key in permissions) clean[key] = !!permissions[key];
  }

  const settingsKey = `permissions.user.${userId}`;
  try {
    if (Object.keys(clean).length === 0) {
      await prisma.settings.deleteMany({ where: { key: settingsKey } });
    } else {
      await prisma.settings.upsert({
        where: { key: settingsKey },
        update: { value: JSON.stringify(clean) },
        create: { key: settingsKey, value: JSON.stringify(clean) },
      });
    }
    invalidateCache();
    res.json({ message: "User permissions updated", userId, permissions: clean });
  } catch (err) {
    console.error("[PUT /settings/permissions/user/:id]", err.message);
    res.status(500).json({ error: "Could not save user permissions" });
  }
});

// Reset per-user overrides back to role defaults (admin)
router.delete("/permissions/user/:id", authorize("ADMIN"), async (req, res) => {
  try {
    await prisma.settings.deleteMany({ where: { key: `permissions.user.${req.params.id}` } });
    invalidateCache();
    res.json({ message: "User permissions reset to role defaults" });
  } catch (err) {
    console.error("[DELETE /settings/permissions/user/:id]", err.message);
    res.status(500).json({ error: "Could not reset user permissions" });
  }
});

// ── Custom Roles CRUD ────────────────────────────────────────────────────────

// List all custom roles
router.get("/roles", authorize("ADMIN"), async (req, res) => {
  try {
    const data = await loadRolePerms();
    res.json({
      builtIn: Object.keys(ROLE_DEFAULTS),
      customRoles: data.customRoles,
      groups: PERMISSION_GROUPS,
    });
  } catch (err) {
    console.error("[GET /settings/roles]", err.message);
    res.status(500).json({ error: "Could not load roles" });
  }
});

// Create a new custom role
router.post("/roles", authorize("ADMIN"), async (req, res) => {
  const { name, permissions } = req.body;
  if (!name || !permissions) {
    return res.status(400).json({ error: "Role name and permissions are required" });
  }

  // Generate a key from the name (uppercase, underscored)
  const roleKey = name.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
  if (!roleKey) return res.status(400).json({ error: "Invalid role name" });
  if (BUILT_IN_ROLES.includes(roleKey)) {
    return res.status(400).json({ error: "Cannot use a built-in role name" });
  }

  const clean = {};
  for (const key of ALL_KEYS) clean[key] = !!permissions[key];

  const settingsKey = `customrole.${roleKey}`;
  try {
    const existing = await prisma.settings.findUnique({ where: { key: settingsKey } });
    if (existing) {
      return res.status(409).json({ error: "A role with this name already exists" });
    }
    await prisma.settings.create({
      data: { key: settingsKey, value: JSON.stringify({ name: name.trim(), permissions: clean }) },
    });
    invalidateCache();
    res.status(201).json({ message: "Role created", roleKey, name: name.trim(), permissions: clean });
  } catch (err) {
    console.error("[POST /settings/roles]", err.message);
    res.status(500).json({ error: "Could not create role" });
  }
});

// Update a custom role
router.put("/roles/:key", authorize("ADMIN"), async (req, res) => {
  const roleKey = req.params.key;
  const { name, permissions } = req.body;
  if (!name || !permissions) {
    return res.status(400).json({ error: "Role name and permissions are required" });
  }
  if (BUILT_IN_ROLES.includes(roleKey)) {
    return res.status(400).json({ error: "Cannot modify built-in roles here" });
  }

  const clean = {};
  for (const key of ALL_KEYS) clean[key] = !!permissions[key];

  const settingsKey = `customrole.${roleKey}`;
  try {
    await prisma.settings.upsert({
      where: { key: settingsKey },
      update: { value: JSON.stringify({ name: name.trim(), permissions: clean }) },
      create: { key: settingsKey, value: JSON.stringify({ name: name.trim(), permissions: clean }) },
    });
    invalidateCache();
    res.json({ message: "Role updated", roleKey, name: name.trim(), permissions: clean });
  } catch (err) {
    console.error("[PUT /settings/roles/:key]", err.message);
    res.status(500).json({ error: "Could not update role" });
  }
});

// Delete a custom role
router.delete("/roles/:key", authorize("ADMIN"), async (req, res) => {
  const roleKey = req.params.key;
  if (BUILT_IN_ROLES.includes(roleKey)) {
    return res.status(400).json({ error: "Cannot delete built-in roles" });
  }

  try {
    // Check if any users are assigned to this role
    const usersWithRole = await prisma.user.count({ where: { role: roleKey } });
    if (usersWithRole > 0) {
      return res.status(400).json({
        error: `Cannot delete role — ${usersWithRole} user(s) are still assigned to it. Reassign them first.`,
      });
    }

    await prisma.settings.deleteMany({ where: { key: `customrole.${roleKey}` } });
    invalidateCache();
    res.json({ message: "Role deleted", roleKey });
  } catch (err) {
    console.error("[DELETE /settings/roles/:key]", err.message);
    res.status(500).json({ error: "Could not delete role" });
  }
});

module.exports = router;
module.exports.loadRolePerms = loadRolePerms;
module.exports.effectivePermsForUser = effectivePermsForUser;
module.exports.invalidateCache = invalidateCache;

const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const BUILT_IN_ROLES = ["ADMIN", "MANAGER", "CASHIER"];

const authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    if (roles.includes(userRole)) return next();

    // If the route accepts ANY non-ADMIN built-in role, also allow custom roles
    // through — their fine-grained access is controlled by checkPermission
    const adminOnly = roles.length === 1 && roles[0] === "ADMIN";
    if (!adminOnly && !BUILT_IN_ROLES.includes(userRole)) {
      return next();
    }

    return res.status(403).json({ error: "You do not have permission to do this" });
  };
};

// Fine-grained permission check that respects the admin-configured role permissions.
// ADMIN always passes. For other roles it consults the settings table.
const checkPermission = (permissionKey) => {
  return async (req, res, next) => {
    if (req.user.role === "ADMIN") return next();

    try {
      const { effectivePermsForUser } = require("../routes/settings");
      const perms = await effectivePermsForUser(req.user.id, req.user.role);
      if (perms[permissionKey]) return next();
    } catch (err) {
      console.error("[checkPermission]", err.message);
    }

    return res.status(403).json({ error: "You do not have permission for this action" });
  };
};

module.exports = { authenticate, authorize, checkPermission };

// This middleware checks that the request has a valid JWT token.
// It also handles role-based access so certain routes are restricted.

const jwt = require("jsonwebtoken");

// Verify the token and attach the user info to the request
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

// Use this to restrict a route to specific roles
// Example: authorize("ADMIN", "MANAGER")
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do this" });
    }
    next();
  };
};

module.exports = { authenticate, authorize };

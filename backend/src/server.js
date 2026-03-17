// Entry point for the POS backend server.
// Sets up Express, middleware, and all the routes.

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const inventoryRoutes = require("./routes/inventory");
const salesRoutes = require("./routes/sales");
const customerRoutes = require("./routes/customers");
const reportRoutes = require("./routes/reports");
const userRoutes = require("./routes/users");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow the frontend to talk to this server
app.use(cors());
app.use(express.json());

// All API routes are prefixed with /api
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/users", userRoutes);

// Simple health check so you can confirm the server is running
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "POS server is running" });
});

// Catch-all for routes that don't exist
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler - logs the error and sends a clean response
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong on the server" });
});

app.listen(PORT, () => {
  console.log(`POS server running on http://localhost:${PORT}`);
});

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
const supplierRoutes = require("./routes/suppliers");
const expenseRoutes = require("./routes/expenses");
const branchRoutes = require("./routes/branches");
const warehouseRoutes = require("./routes/warehouses");
const transferRoutes = require("./routes/transfers");
const settingsRoutes = require("./routes/settings");

const prisma = require("./prisma/client");

const app = express();
const PORT = process.env.PORT || 3000;

async function fixupDatabase() {
  try {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE products SET "costPrice" = 0 WHERE "costPrice" IS NULL`
    );
    if (result > 0) console.log(`[startup] Fixed ${result} products with NULL costPrice → 0`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE products ALTER COLUMN "costPrice" SET NOT NULL`
    ).catch(() => {});
    await prisma.$executeRawUnsafe(
      `ALTER TABLE products ALTER COLUMN "costPrice" SET DEFAULT 0`
    ).catch(() => {});

    await prisma.$executeRawUnsafe(
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS "shipping" DOUBLE PRECISION NOT NULL DEFAULT 0`
    ).catch(() => {});

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL
      )
    `).catch(() => {});

    // Convert role column from enum to text for custom role support
    await prisma.$executeRawUnsafe(
      `ALTER TABLE users ALTER COLUMN role TYPE TEXT USING role::TEXT`
    ).catch(() => {});
    await prisma.$executeRawUnsafe(
      `ALTER TABLE users ALTER COLUMN role SET DEFAULT 'CASHIER'`
    ).catch(() => {});
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "Role"`).catch(() => {});

    // Transfer price tracking columns
    await prisma.$executeRawUnsafe(
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0`
    ).catch(() => {});
    await prisma.$executeRawUnsafe(
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0`
    ).catch(() => {});
    await prisma.$executeRawUnsafe(
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0`
    ).catch(() => {});
  } catch (err) {
    console.error("[startup] DB fixup warning:", err.message);
  }
}

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
app.use("/api/suppliers", supplierRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/settings", settingsRoutes);

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

fixupDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`POS server running on http://localhost:${PORT}`);
  });
});

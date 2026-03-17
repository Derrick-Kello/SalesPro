// This seed file creates some initial data so the system is ready to use right away.
// Run it with: npm run seed

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding the database...");

  // Create the default admin account
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      fullName: "System Administrator",
      role: "ADMIN",
    },
  });

  // Create a sample manager
  const managerPassword = await bcrypt.hash("manager123", 10);
  await prisma.user.upsert({
    where: { username: "manager" },
    update: {},
    create: {
      username: "manager",
      password: managerPassword,
      fullName: "Store Manager",
      role: "MANAGER",
    },
  });

  // Create a sample cashier
  const cashierPassword = await bcrypt.hash("cashier123", 10);
  await prisma.user.upsert({
    where: { username: "cashier" },
    update: {},
    create: {
      username: "cashier",
      password: cashierPassword,
      fullName: "John Cashier",
      role: "CASHIER",
    },
  });

  // Add some sample products with inventory
  const products = [
    { name: "Coca Cola 500ml", category: "Beverages", price: 1.5, barcode: "5000112637922", quantity: 100 },
    { name: "Bread Loaf", category: "Bakery", price: 2.0, barcode: "5010029013004", quantity: 50 },
    { name: "Milk 1L", category: "Dairy", price: 1.8, barcode: "5010029013005", quantity: 80 },
    { name: "Rice 1kg", category: "Grains", price: 3.5, barcode: "5010029013006", quantity: 200 },
    { name: "Cooking Oil 1L", category: "Oils", price: 4.0, barcode: "5010029013007", quantity: 60 },
    { name: "Sugar 1kg", category: "Grains", price: 2.5, barcode: "5010029013008", quantity: 150 },
    { name: "Eggs (12 pack)", category: "Dairy", price: 3.0, barcode: "5010029013009", quantity: 40 },
    { name: "Bottled Water 500ml", category: "Beverages", price: 0.8, barcode: "5010029013010", quantity: 200 },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { barcode: p.barcode },
      update: {},
      create: {
        name: p.name,
        category: p.category,
        price: p.price,
        barcode: p.barcode,
      },
    });

    // Make sure each product has an inventory record
    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: {},
      create: {
        productId: product.id,
        quantity: p.quantity,
        lowStockAlert: 10,
      },
    });
  }

  console.log("Done. Default credentials:");
  console.log("  Admin    -> username: admin    | password: admin123");
  console.log("  Manager  -> username: manager  | password: manager123");
  console.log("  Cashier  -> username: cashier  | password: cashier123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

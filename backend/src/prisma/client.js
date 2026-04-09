const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Keep the Neon serverless DB warm by pinging every 4 minutes
setInterval(() => {
  prisma.$queryRaw`SELECT 1`.catch(() => {});
}, 240_000);

// Warm the connection immediately on startup
prisma.$queryRaw`SELECT 1`.catch(() => {});

module.exports = prisma;

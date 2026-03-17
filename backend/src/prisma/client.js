// We create a single Prisma client instance and reuse it across the app.
// Creating a new client for every request would be wasteful and slow.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = prisma;

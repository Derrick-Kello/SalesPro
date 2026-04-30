/**
 * Options for interactive / batched prisma.$transaction(...) calls.
 * Neon and other serverless Postgres often need a higher maxWait or you get:
 * P2028 — "Unable to start a transaction in the given time"
 * @see https://www.prisma.io/docs/orm/reference/prisma-client-reference#transaction-options
 */
module.exports = Object.freeze({
  maxWait: 25_000,
  timeout: 90_000,
});

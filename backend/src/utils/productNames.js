/** Parse "Base (Variant)" style product names. */
function parseVariantProductName(name) {
  const raw = String(name || "").trim();
  if (!raw) return { base: "", variantLabel: null };
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { base: m[1].trim(), variantLabel: m[2].trim() };
  return { base: raw, variantLabel: null };
}

function variantProductName(base, label) {
  return `${String(base || "").trim()} (${String(label || "").trim()})`;
}

function normalizeProductNameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function findActiveProductByName(tx, nameTrim, excludeId) {
  if (!nameTrim) return null;
  return tx.product.findFirst({
    where: {
      isActive: true,
      name: { equals: nameTrim, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });
}

async function assertUniqueProductName(tx, nameTrim, excludeId) {
  const dup = await findActiveProductByName(tx, nameTrim, excludeId);
  if (dup) {
    const e = new Error(`A product named "${dup.name}" already exists`);
    e.status = 409;
    throw e;
  }
}

module.exports = {
  parseVariantProductName,
  variantProductName,
  normalizeProductNameKey,
  findActiveProductByName,
  assertUniqueProductName,
};

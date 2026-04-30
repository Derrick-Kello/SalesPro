// Slug helpers for the public storefront API.
// Slug = lowercased, trimmed, non-alphanumeric collapsed to "-".
// We don't have a slug column on Branch, so we resolve at query-time by
// matching `slugify(branch.name) === slug`.

const prisma = require("../prisma/client");

function slugify(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve a public storefront branch by slug.
 * Returns null if no active branch matches.
 */
async function resolveBranchBySlug(slug) {
  const wanted = slugify(slug);
  if (!wanted) return null;

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
  });

  return branches.find((b) => slugify(b.name) === wanted) || null;
}

module.exports = { slugify, resolveBranchBySlug };

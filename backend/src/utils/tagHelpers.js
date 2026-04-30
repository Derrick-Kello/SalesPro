/**
 * Product tags with optional per-tag quantities (global catalog counts).
 */

function tagRowHasQty(pt) {
  return pt?.quantity != null && Number.isFinite(Number(pt.quantity));
}

function productTracksTagQuantities(assignments) {
  return Array.isArray(assignments) && assignments.some(tagRowHasQty);
}

async function loadProductTagAssignments(tx, productId) {
  return tx.productTag.findMany({
    where: { productId },
    include: { tag: { select: { id: true, name: true, group: true } } },
  });
}

function assertTagSellable(assignments, tagId, itemQty, productLabel) {
  if (!productTracksTagQuantities(assignments)) return;
  if (!tagId) {
    const e = new Error(
      `Select a tag for "${productLabel}" — this product tracks stock per tag.`
    );
    e.status = 400;
    throw e;
  }
  const row = assignments.find((a) => a.tagId === tagId && tagRowHasQty(a));
  if (!row) {
    const e = new Error(`Invalid tag for "${productLabel}" (must be a counted tag on this product).`);
    e.status = 400;
    throw e;
  }
  if (Number(row.quantity) < itemQty) {
    const e = new Error(
      `Not enough stock for "${row.tag?.name ?? "tag"}" under ${productLabel}.`
    );
    e.status = 400;
    throw e;
  }
}

async function decrementTrackedTagQty(tx, productId, tagId, qty) {
  if (!tagId || !qty || qty <= 0) return;
  const row = await tx.productTag.findUnique({
    where: { productId_tagId: { productId, tagId } },
  });
  if (!row || row.quantity == null) return;
  await tx.productTag.update({
    where: { productId_tagId: { productId, tagId } },
    data: { quantity: { decrement: qty } },
  });
}

async function incrementTrackedTagQty(tx, productId, tagId, qty) {
  if (!tagId || !qty || qty <= 0) return;
  const row = await tx.productTag.findUnique({
    where: { productId_tagId: { productId, tagId } },
  });
  if (!row || row.quantity == null) return;
  await tx.productTag.update({
    where: { productId_tagId: { productId, tagId } },
    data: { quantity: { increment: qty } },
  });
}

async function ensureTag(tx, name, group) {
  const nm = String(name || "").trim();
  if (!nm) return null;
  const grp = group != null && String(group).trim() ? String(group).trim() : null;
  return tx.tag.upsert({
    where: { name: nm },
    create: { name: nm, group: grp },
    update: grp != null ? { group: grp } : {},
  });
}

/**
 * Replace all product_tags for a product. tags: [{ name, group?, quantity? number|null }]
 */
async function syncProductTags(tx, productId, tagsInput) {
  await tx.productTag.deleteMany({ where: { productId } });
  if (!Array.isArray(tagsInput) || tagsInput.length === 0) return;

  for (const t of tagsInput) {
    const rawName = t.name ?? t.tagName ?? t.label;
    const tagRow = await ensureTag(tx, rawName, t.group ?? t.tagGroup);
    if (!tagRow) continue;
    let qty = t.quantity;
    if (qty === "" || qty === undefined) qty = null;
    if (qty != null) {
      const n = parseInt(qty, 10);
      qty = Number.isFinite(n) && n >= 0 ? n : null;
    }
    await tx.productTag.create({
      data: {
        productId,
        tagId: tagRow.id,
        quantity: qty != null ? qty : null,
      },
    });
  }
}

async function validateReceiptTag(tx, productId, tagId) {
  if (!tagId || !Number.isFinite(tagId)) return null;
  const link = await tx.productTag.findUnique({
    where: { productId_tagId: { productId, tagId } },
  });
  if (!link) {
    const e = new Error("That tag is not linked to this product");
    e.status = 400;
    throw e;
  }
  return tagId;
}

module.exports = {
  tagRowHasQty,
  productTracksTagQuantities,
  loadProductTagAssignments,
  assertTagSellable,
  decrementTrackedTagQty,
  incrementTrackedTagQty,
  syncProductTags,
  validateReceiptTag,
};

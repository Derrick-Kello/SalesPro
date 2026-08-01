/**
 * Queueing and replay for sales rung up without a connection.
 *
 * The contract with the backend is a client-generated `clientRef` used as an
 * idempotency key: replaying the same ref returns the original sale instead of
 * creating a second one, so a retry after a half-finished request can never
 * charge twice or decrement stock twice.
 *
 * Failure handling splits in two, and the split matters:
 *  - the request never reached the server  → keep it queued, try again later
 *  - the server rejected it (4xx)          → park as FAILED for a human
 * A rejected sale is money that was taken at the till but has no record on the
 * server, so it is never discarded automatically.
 */
import { api } from '../api/client'
import {
  FAILED,
  QUEUED,
  SYNCING,
  allQueuedSales,
  enqueueSale,
  newClientRef,
  removeQueuedSale,
  updateQueuedSale,
} from './db'

/**
 * Record a sale locally and build the receipt the cashier prints now.
 *
 * @param payload  exactly what would have been POSTed to /sales
 * @param context  { user, branchName, customer, productsById } for the receipt
 */
export async function queueSaleOffline(payload, context = {}) {
  const clientRef = newClientRef()
  const createdAt = new Date().toISOString()

  const entry = {
    clientRef,
    createdAt,
    status: QUEUED,
    attempts: 0,
    lastError: null,
    lastTriedAt: null,
    grandTotal: Number(context.grandTotal) || 0,
    payload: { ...payload, clientRef, offlineCreatedAt: createdAt },
    receipt: buildOfflineReceipt(payload, context, clientRef, createdAt),
  }

  await enqueueSale(entry)
  return entry
}

/**
 * A receipt shaped like the server's sale response so the existing print view
 * renders unchanged. `id` is null — there is no server id yet, and inventing
 * one would put a number on a customer's receipt that matches nothing.
 */
function buildOfflineReceipt(payload, context, clientRef, createdAt) {
  const { user, branchName, customer, productsById = {}, tagsById = {} } = context
  const items = payload.items || []

  const saleItems = items.map((i) => {
    const product = productsById[i.productId] || {}
    return {
      id: `${clientRef}-${i.productId}-${i.tagId ?? 'na'}`,
      productId: i.productId,
      tagId: i.tagId ?? null,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      subtotal: Number(i.unitPrice) * Number(i.quantity),
      product: { id: i.productId, name: product.name ?? `Product ${i.productId}`, price: product.price ?? i.unitPrice },
      tag: i.tagId ? { id: i.tagId, name: tagsById[i.tagId]?.name ?? '' } : null,
    }
  })

  const totalAmount = saleItems.reduce((s, i) => s + i.subtotal, 0)
  const grandTotal = Math.max(
    0,
    totalAmount - (Number(payload.discount) || 0) + (Number(payload.tax) || 0) + (Number(payload.shipping) || 0),
  )
  const credited = payload.partialPayment
    ? Number(payload.amountPaid) || 0
    : grandTotal
  const tendered = Number(payload.amountPaid) || 0

  return {
    id: null,
    clientRef,
    offlinePending: true,
    createdAt,
    totalAmount,
    discount: Number(payload.discount) || 0,
    tax: Number(payload.tax) || 0,
    shipping: Number(payload.shipping) || 0,
    grandTotal,
    status: credited >= grandTotal - 0.009 ? 'COMPLETED' : 'PARTIALLY_PAID',
    saleItems,
    user: { fullName: user?.fullName ?? user?.username ?? 'Cashier', username: user?.username ?? '' },
    customer: customer ? { name: customer.name, phone: customer.phone } : null,
    branch: branchName ? { name: branchName } : null,
    payment: {
      method: payload.paymentMethod,
      amountPaid: credited,
      change:
        payload.paymentMethod === 'CASH' ? Math.max(0, tendered - credited) : 0,
      reference: payload.paymentReference ?? null,
    },
    paidToDate: credited,
    balanceDue: Math.max(0, grandTotal - credited),
  }
}

/**
 * Push one queued sale to the server.
 * @returns {'synced'|'duplicate'|'retry'|'failed'}
 */
export async function syncOne(entry) {
  await updateQueuedSale(entry.clientRef, {
    status: SYNCING,
    lastTriedAt: new Date().toISOString(),
  })

  try {
    const sale = await api.post('/sales', entry.payload)
    await removeQueuedSale(entry.clientRef)
    return { outcome: sale?.duplicate ? 'duplicate' : 'synced', sale }
  } catch (err) {
    if (err.isNetworkError) {
      // Still offline — put it back untouched and try again later.
      await updateQueuedSale(entry.clientRef, {
        status: QUEUED,
        attempts: (entry.attempts || 0) + 1,
        lastError: null,
      })
      return { outcome: 'retry' }
    }
    // The server answered and refused: stock ran out, product deleted, etc.
    // Park it — this is real money that needs a person to reconcile.
    await updateQueuedSale(entry.clientRef, {
      status: FAILED,
      attempts: (entry.attempts || 0) + 1,
      lastError: err.message || 'Rejected by server',
    })
    return { outcome: 'failed', error: err }
  }
}

/**
 * Replay the queue oldest-first, sequentially — sales decrement shared stock,
 * so firing them in parallel would race each other for the last units.
 * Stops early if the connection drops again.
 */
export async function syncQueue({ onProgress } = {}) {
  const rows = await allQueuedSales()
  const pending = rows.filter((r) => r.status === QUEUED || r.status === SYNCING)
  const result = { synced: 0, duplicates: 0, failed: 0, remaining: 0 }

  for (const entry of pending) {
    const { outcome } = await syncOne(entry)
    if (outcome === 'synced') result.synced++
    else if (outcome === 'duplicate') result.duplicates++
    else if (outcome === 'failed') result.failed++
    else {
      result.remaining = pending.length - (result.synced + result.duplicates + result.failed)
      break
    }
    if (onProgress) onProgress({ ...result })
  }

  return result
}

/** Retry a parked sale after someone fixed the cause (restocked, etc.). */
export async function retryFailed(clientRef) {
  const rows = await allQueuedSales()
  const entry = rows.find((r) => r.clientRef === clientRef)
  if (!entry) return { outcome: 'gone' }
  return syncOne({ ...entry, status: QUEUED })
}

/** Explicit, logged decision to abandon a queued sale. */
export function discardQueued(clientRef) {
  return removeQueuedSale(clientRef)
}

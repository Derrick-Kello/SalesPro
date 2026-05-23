import { useMemo } from 'react'
import { productDisplayName } from '../../utils/productDisplay'

const PAYMENT_OPTS = ['UNPAID', 'PARTIAL', 'PAID']

function lineFromReceipt(r) {
  return {
    id: r.id,
    warehouseId: String(r.warehouseId ?? r.warehouse?.id ?? ''),
    productId: String(r.productId ?? r.product?.id ?? ''),
    quantity: String(r.quantity ?? ''),
    supplier: r.supplier || '',
    note: r.note || '',
    paymentStatus: String(r.paymentStatus || (r.isPaid ? 'PAID' : 'UNPAID')).toUpperCase(),
    tagName: r.tag?.name || '',
  }
}

/** Full receipt editor — same fields as Purchase → Receive. */
export default function PurchaseEditForm({
  receipts = [],
  lineEdits,
  onLineChange,
  warehouses = [],
  products = [],
  suppliers = [],
}) {
  const list = Array.isArray(receipts) ? receipts : []
  const edits = lineEdits || list.map(lineFromReceipt)

  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive !== false),
    [products]
  )

  if (!list.length) {
    return <p style={{ color: 'var(--text-muted)' }}>No receipt lines selected.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {list.map((r, idx) => {
        const ed = edits[idx] || lineFromReceipt(r)
        return (
          <div
            key={r.id}
            className="card"
            style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}
          >
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>
              Line #{r.id}
              {r.product?.name ? ` · ${r.product.name}` : ''}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Warehouse *</label>
                <select
                  value={ed.warehouseId}
                  onChange={(e) => onLineChange(idx, 'warehouseId', e.target.value)}
                >
                  <option value="">Select warehouse</option>
                  {warehouses.filter((w) => w.isActive !== false).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.branch?.name ? ` · ${w.branch.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Product *</label>
                <select
                  value={ed.productId}
                  onChange={(e) => onLineChange(idx, 'productId', e.target.value)}
                >
                  <option value="">Select product</option>
                  {activeProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.id} · {productDisplayName(p)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  min={1}
                  value={ed.quantity}
                  onChange={(e) => onLineChange(idx, 'quantity', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Payment status</label>
                <select
                  value={ed.paymentStatus}
                  onChange={(e) => onLineChange(idx, 'paymentStatus', e.target.value)}
                >
                  {PAYMENT_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Supplier *</label>
                {suppliers.length > 0 ? (
                  <select
                    value={ed.supplier}
                    onChange={(e) => onLineChange(idx, 'supplier', e.target.value)}
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={ed.supplier}
                    onChange={(e) => onLineChange(idx, 'supplier', e.target.value)}
                  />
                )}
              </div>
              <div className="form-group">
                <label>Tag (optional)</label>
                <input
                  value={ed.tagName}
                  onChange={(e) => onLineChange(idx, 'tagName', e.target.value)}
                  placeholder="Size / colour label"
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Note</label>
              <input
                value={ed.note}
                onChange={(e) => onLineChange(idx, 'note', e.target.value)}
                placeholder="Optional note"
              />
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Unit cost is taken from the product at save time. Changing warehouse, product, or quantity
              adjusts warehouse stock automatically.
            </p>
          </div>
        )
      })}
    </div>
  )
}

export { lineFromReceipt }

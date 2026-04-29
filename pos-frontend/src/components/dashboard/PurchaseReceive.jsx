import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { SaveBtn } from '../LoadingRow'
import { PackagePlus } from 'lucide-react'

export default function PurchaseReceive() {
  const { fmt } = useCurrency()
  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [warehouseId, setWarehouseId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [lastSuccess, setLastSuccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, saveErr, runSave, setSaveErr] = useAsync()

  const productMap = useMemo(() => {
    const m = {}
    products.forEach((p) => { m[p.id] = p })
    return m
  }, [products])

  const selected = productMap[productId] || null
  const previewQty = parseInt(quantity, 10) || 0
  const previewLine =
    selected && previewQty > 0 ? previewQty * (selected.costPrice || 0) : 0

  async function load() {
    setLoading(true)
    try {
      const [wh, pr] = await Promise.all([api.get('/warehouses'), api.get('/products')])
      setWarehouses(wh.filter((w) => w.isActive !== false))
      setProducts(pr)
    } catch {
      setWarehouses([])
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('purchase-receive', () => load())

  async function submit(e) {
    e.preventDefault()
    setSaveErr('')
    setLastSuccess(null)
    if (!warehouseId || !productId || !quantity || parseInt(quantity, 10) <= 0) {
      setSaveErr('Warehouse, product, and quantity are required')
      return
    }
    await runSave(async () => {
      const res = await api.post('/purchase/warehouse-receipts', {
        warehouseId: parseInt(warehouseId, 10),
        productId: parseInt(productId, 10),
        quantity: parseInt(quantity, 10),
        supplier: supplier || null,
        note: note || null,
      })
      setLastSuccess(res)
      setQuantity('')
      setNote('')
    })
  }

  return (
    <div>
      <div className="section-header">
        <h2>Purchase — Receive to warehouse</h2>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 720, lineHeight: 1.5, marginBottom: 20 }}>
        Record stock entering a warehouse ledger. Each save creates a receipt line and updates warehouse
        quantities. To move stock to a retail branch, use <strong>Transfers</strong>.
      </p>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && (
        <div className="card" style={{ padding: 22, maxWidth: 640, borderRadius: 12 }}>
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Warehouse *</label>
              <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required>
                <option value="">Select warehouse</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.branch?.name ? ` · ${w.branch.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Product *</label>
              <select value={productId} onChange={e => setProductId(e.target.value)} required>
                <option value="">Select product</option>
                {products.filter(p => p.isActive).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="Units received"
                  required
                />
              </div>
              <div className="form-group">
                <label>Supplier (optional)</label>
                <input
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                  placeholder="Supplier name"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reference, invoice #" />
            </div>

            {selected && previewQty > 0 && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'var(--surface2)',
                  fontSize: 13,
                  display: 'grid',
                  gap: 6,
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>
                  Snapshot cost × qty (product cost price):{' '}
                  <strong>{fmt(selected.costPrice ?? 0)}</strong>
                  {' × '}{previewQty} ={' '}
                  <strong style={{ color: 'var(--primary)' }}>{fmt(previewLine)}</strong>
                </span>
              </div>
            )}

            {saveErr && <div className="error-message" style={{ marginBottom: 12 }}>{saveErr}</div>}
            {lastSuccess?.receipt && (
              <div
                role="status"
                style={{
                  marginBottom: 14,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'var(--success-light, rgba(34,197,94,0.12))',
                  border: '1px solid rgba(34,197,94,0.35)',
                  fontSize: 13,
                }}
              >
                Saved receipt #{lastSuccess.receipt.id} — added <strong>{lastSuccess.receipt.quantity}</strong>{' '}
                to warehouse stock.
              </div>
            )}

            <SaveBtn loading={saving}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <PackagePlus size={17} strokeWidth={2} /> Record receipt
              </span>
            </SaveBtn>
          </form>
        </div>
      )}
    </div>
  )
}

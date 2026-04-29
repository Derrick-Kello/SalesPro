import { useEffect, useMemo, useState, useRef } from 'react'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { SaveBtn } from '../LoadingRow'
import { PackagePlus, FileUp } from 'lucide-react'
import * as XLSX from 'xlsx'

function sheetRowsToBulkLines(rows) {
  const out = []
  for (const row of rows) {
    const n = {}
    Object.entries(row || {}).forEach(([k, v]) => {
      const key = String(k).trim().toLowerCase().replace(/\s+/g, '_')
      n[key] = v
    })
    const pidRaw = n.product_id ?? n.productid
    const pid = pidRaw !== undefined && pidRaw !== '' ? parseInt(String(pidRaw), 10) : NaN
    const barcode =
      n.barcode != null && String(n.barcode).trim() !== '' ? String(n.barcode).trim() : null
    const qty = parseInt(n.quantity ?? n.qty ?? n.units, 10)
    const supplier = n.supplier != null ? String(n.supplier).trim() : ''
    const note = n.note != null ? String(n.note).trim() : ''
    if (!Number.isFinite(qty) || qty <= 0) continue
    if (!(Number.isFinite(pid) && pid > 0) && !barcode) continue
    out.push({
      productId: Number.isFinite(pid) && pid > 0 ? pid : undefined,
      barcode: barcode || undefined,
      quantity: qty,
      supplier,
      note: note || undefined,
    })
  }
  return out
}

export default function PurchaseReceive() {
  const { fmt } = useCurrency()
  const csvRef = useRef(null)

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
  const [bulkMsg, setBulkMsg] = useState(null)
  const [pendingBulkLines, setPendingBulkLines] = useState([])
  const [bulkLoading, bulkErr, runBulk, setBulkErr] = useAsync()

  const productMap = useMemo(() => {
    const m = {}
    products.forEach((p) => {
      m[p.id] = p
    })
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

  useEffect(() => {
    load()
  }, [])
  useTabRefresh('purchase-receive', () => load())

  async function submit(e) {
    e.preventDefault()
    setSaveErr('')
    setLastSuccess(null)
    if (!warehouseId || !productId || !quantity || parseInt(quantity, 10) <= 0) {
      setSaveErr('Warehouse, product, and quantity are required')
      return
    }
    const sup = supplier.trim()
    if (!sup) {
      setSaveErr('Supplier is required')
      return
    }
    await runSave(async () => {
      const res = await api.post('/purchase/warehouse-receipts', {
        warehouseId: parseInt(warehouseId, 10),
        productId: parseInt(productId, 10),
        quantity: parseInt(quantity, 10),
        supplier: sup,
        note: note.trim() ? note.trim() : null,
      })
      setLastSuccess(res)
      setQuantity('')
      setNote('')
    })
  }

  function linePreviewLabel(L) {
    if (L.productId) {
      const p = productMap[L.productId]
      return p ? `#${L.productId} · ${p.name}` : `Product #${L.productId}`
    }
    if (L.barcode) {
      const p = products.find((x) => x.barcode === L.barcode)
      return p ? `#${p.id} · ${p.name} (${L.barcode})` : `Barcode ${L.barcode}`
    }
    return '—'
  }

  function handleCsvPopulate(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setBulkMsg(null)
    setBulkErr('')

    void (async () => {
      try {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        const parsed = sheetRowsToBulkLines(rows)

        for (let i = 0; i < parsed.length; i++) {
          if (!parsed[i].supplier?.trim()) {
            setBulkErr(
              `Supplier required on spreadsheet row ${i + 2} (row 1 is the header).`
            )
            setPendingBulkLines([])
            return
          }
        }

        if (!parsed.length) {
          setBulkErr(
            'No valid rows — include product_id or barcode plus quantity and supplier.'
          )
          setPendingBulkLines([])
          return
        }

        setPendingBulkLines(parsed)
        setBulkErr('')
      } catch {
        setBulkErr('Could not read that file. Try a UTF-8 .csv or Excel file.')
        setPendingBulkLines([])
      }
    })()
  }

  async function submitPendingBulk() {
    setBulkMsg(null)
    setBulkErr('')
    if (!warehouseId) {
      setBulkErr('Select a warehouse first.')
      return
    }
    if (!pendingBulkLines.length) return

    await runBulk(async () => {
      const lines = pendingBulkLines.map((L) => {
        const o = {
          quantity: L.quantity,
          supplier: L.supplier.trim(),
          note: L.note || undefined,
        }
        if (L.productId) o.productId = L.productId
        else if (L.barcode) o.barcode = L.barcode
        return o
      })

      const res = await api.post('/purchase/warehouse-receipts/bulk', {
        warehouseId: parseInt(warehouseId, 10),
        lines,
      })

      setBulkMsg(res)
      setPendingBulkLines([])
      load()
    })
  }

  /** First row → single receipt form */
  function applyFirstCsvRowToForm() {
    setSaveErr('')
    setBulkErr('')
    if (!pendingBulkLines.length) {
      setBulkErr('Load a CSV first.')
      return
    }
    const L = pendingBulkLines[0]
    if (L.productId) {
      setProductId(String(L.productId))
    } else if (L.barcode) {
      const p = products.find((x) => x.barcode === L.barcode && x.isActive !== false)
      if (p) setProductId(String(p.id))
      else setSaveErr(`No active product with barcode ${L.barcode}`)
    }
    setQuantity(String(L.quantity))
    setSupplier(L.supplier)
    setNote(L.note || '')
  }

  return (
    <div>
      <div className="section-header">
        <h2>Purchase — Receive to warehouse</h2>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 720, lineHeight: 1.5, marginBottom: 20 }}>
        Record stock entering a warehouse ledger. Each save creates a receipt line and updates warehouse
        quantities — <strong>supplier is required</strong> for every line. Branch stock only changes via{' '}
        <strong>Transfers</strong>.
      </p>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && (
        <>
          <div className="card" style={{ padding: 22, maxWidth: 640, borderRadius: 12, marginBottom: 22 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Single receipt</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              <button type="button" className="btn btn-outline" style={{ marginRight: 8 }} onClick={() => csvRef.current?.click()}>
                <FileUp size={14} strokeWidth={2} style={{ marginRight: 6 }} />
                Choose CSV or Excel
              </button>
              {pendingBulkLines.length > 0 ? (
                <button type="button" className="btn btn-outline" onClick={applyFirstCsvRowToForm}>
                  Copy first row into this form
                </button>
              ) : null}
            </p>
            <form onSubmit={submit}>
              <div className="form-group">
                <label>Warehouse *</label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  required
                >
                  <option value="">Select warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.branch?.name ? ` · ${w.branch.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Product *</label>
                <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
                  <option value="">Select product</option>
                  {products.filter((p) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.id} · {p.name}
                    </option>
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
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Units received"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Supplier *</label>
                  <input
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="Vendor / supplier name"
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reference, invoice #"
                />
              </div>

              {selected && previewQty > 0 && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'var(--surface2)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    Snapshot cost × qty (product cost price):{' '}
                    <strong>{fmt(selected.costPrice ?? 0)}</strong> × {previewQty} ={' '}
                    <strong style={{ color: 'var(--primary)' }}>{fmt(previewLine)}</strong>
                  </span>
                </div>
              )}

              {saveErr && (
                <div className="error-message" style={{ marginBottom: 12 }}>
                  {saveErr}
                </div>
              )}
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
                  Saved receipt #{lastSuccess.receipt.id} — added{' '}
                  <strong>{lastSuccess.receipt.quantity}</strong> to warehouse stock.
                </div>
              )}

              <SaveBtn loading={saving}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <PackagePlus size={17} strokeWidth={2} /> Record receipt
                </span>
              </SaveBtn>
            </form>
          </div>

          <input
            ref={csvRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            style={{ display: 'none' }}
            onChange={handleCsvPopulate}
          />

          <div
            className="card"
            style={{
              padding: 22,
              maxWidth: 720,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background:
                'linear-gradient(155deg, var(--surface, #fff) 0%, rgba(0,100,160,0.04) 100%)',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>From spreadsheet</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, lineHeight: 1.45 }}>
              Upload a <strong>.csv</strong> or Excel file to load lines here (nothing is saved until you confirm).
              Each row needs <strong>quantity</strong>, <strong>supplier</strong>, and either <strong>product_id</strong> or{' '}
              <strong>barcode</strong>. Optional <strong>note</strong>. Row 1 is the header. Use the{' '}
              <strong>warehouse</strong> selected in <em>Single receipt</em> above.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <button type="button" className="btn btn-primary" onClick={() => csvRef.current?.click()}>
                <FileUp size={16} strokeWidth={2} style={{ marginRight: 8 }} />
                Choose CSV or Excel
              </button>
              {pendingBulkLines.length > 0 ? (
                <>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {pendingBulkLines.length} line(s) loaded
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={bulkLoading || !warehouseId}
                    onClick={() => void submitPendingBulk()}
                  >
                    Record all to warehouse
                  </button>
                </>
              ) : null}
              {bulkErr && (
                <span className="error-message" style={{ display: 'inline-block' }}>
                  {bulkErr}
                </span>
              )}
              {bulkLoading && (
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Saving…</span>
              )}
            </div>
            {pendingBulkLines.length > 0 && (
              <div className="table-container" style={{ marginBottom: bulkMsg ? 14 : 0, maxHeight: 280, overflow: 'auto' }}>
                <table className="data-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Supplier</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingBulkLines.map((L, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{linePreviewLabel(L)}</td>
                        <td>{L.quantity}</td>
                        <td>{L.supplier}</td>
                        <td>{L.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bulkMsg && (
              <div
                style={{
                  marginTop: 8,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'var(--surface2)',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <strong>{bulkMsg.createdCount}</strong> line(s) created
                {bulkMsg.failedCount > 0 ? (
                  <>
                    , <strong>{bulkMsg.failedCount}</strong> skipped
                  </>
                ) : null}
                .
                {bulkMsg.errors?.length > 0 && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                    {bulkMsg.errors.slice(0, 8).map((e) => (
                      <li key={e.line}>
                        Row {e.line}: {e.error}
                      </li>
                    ))}
                    {bulkMsg.errors.length > 8 ? <li>…</li> : null}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

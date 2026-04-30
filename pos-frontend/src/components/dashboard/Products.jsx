import { useEffect, useState, useRef } from 'react'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import { usePermissions } from '../../context/PermissionContext'
import { useAlert } from '../../context/AlertContext'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import BarcodeDisplay from '../BarcodeDisplay'
import BarcodePrintSheet from '../BarcodePrintSheet'
import { Plus, Pencil, Trash2, Search, Barcode, FileDown, FileUp, FileText, X } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { productDisplayName } from '../../utils/productDisplay'

function downloadCsv(filename, csvText) {
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvText], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function normalizeSpreadsheetRow(row) {
  const n = {}
  Object.entries(row || {}).forEach(([k, v]) => {
    const key = String(k).trim().toLowerCase().replace(/\s+/g, '_')
    n[key] = v
  })
  return n
}

function generateUPCA() {
  const digits = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10))
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8] + digits[10]
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7] + digits[9]
  const check = (10 - ((oddSum * 3 + evenSum) % 10)) % 10
  return [...digits, check].join('')
}

/** Plain tag or optional count: XL=24 → qty 24; Blue → label only */
function parseTagSegment(seg) {
  const s = String(seg || '').trim()
  if (!s) return null
  const nameOnly = s.replace(/=\s*\d+\s*$/, '').trim()
  if (!nameOnly) return null
  return { name: nameOnly, quantity: null }
}

function dedupeTagsForSave(list) {
  const map = new Map()
  for (const item of list) {
    if (!item || !String(item.name || '').trim()) continue
    const name = String(item.name).trim()
    map.set(name.toLowerCase(), {
      name,
      quantity:
        item.quantity != null &&
        Number.isFinite(Number(item.quantity)) &&
        Number(item.quantity) >= 0
          ? Number(item.quantity)
          : null,
    })
  }
  return [...map.values()]
}

/** Parse import `tags` cell: comma-separated, same rules as the product form (XL=10 = counted; Blue = label). */
function parseTagsColumn(raw) {
  if (raw == null || String(raw).trim() === '') return []
  return dedupeTagsForSave(
    String(raw)
      .split(',')
      .map((seg) => parseTagSegment(seg))
      .filter(Boolean),
  )
}

function sumTaggedQuantities(tags) {
  return tags.reduce((sum, t) => {
    if (t.quantity != null && Number.isFinite(Number(t.quantity))) {
      return sum + Number(t.quantity)
    }
    return sum
  }, 0)
}

function tagsBreakdownStockError(tags, stock) {
  const hasCounted = tags.some(
    (t) => t.quantity != null && Number.isFinite(Number(t.quantity)),
  )
  if (!hasCounted) return null
  const sum = sumTaggedQuantities(tags)
  if (sum !== stock) {
    return `tag counts sum to ${sum} but stock is ${stock} — they must match when you use numbers (e.g. xl=10,lg=20)`
  }
  return null
}

function tagsToApiPayload(tags) {
  return tags.map(({ name, quantity }) => ({
    name,
    quantity: quantity != null ? quantity : null,
  }))
}

const EMPTY = {
  name: '',
  category: '',
  price: '',
  costPrice: '',
  barcode: '',
  description: '',
  tagChips: [],
  tagDraft: '',
}

export default function Products({ mode = 'all' }) {
  const { fmt } = useCurrency()
  const { showInfo } = useAlert()
  const { can } = usePermissions()
  const canEdit = can('products.edit') || can('products.create')
  const [products, setProducts] = useState([])
  const [branches, setBranches] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(mode === 'create')
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [printOpen, setPrintOpen] = useState(mode === 'labels')
  const [importError, setImportError] = useState('')
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()
  const fileRef = useRef(null)

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try {
      const [p, b] = await Promise.all([
        api.get('/products'),
        api.get('/branches').catch(() => []),
      ])
      setProducts(p)
      setBranches(b.filter(br => br.isActive))
    } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('products-all', () => load(true))

  // Open create modal when mode switches to 'create'
  useEffect(() => {
    if (mode === 'create') { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }
    if (mode === 'labels') { setPrintOpen(true) }
  }, [mode])

  function openAdd() { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }

  function openEdit(p) {
    setForm({
      name: p.name,
      category: p.category,
      price: p.price,
      costPrice: p.costPrice != null ? p.costPrice : '',
      barcode: p.barcode || '', description: p.description || '',
      tagChips: (p.tags || []).length
        ? dedupeTagsForSave(
          (p.tags || []).map((t) => ({
            name: String(t.name ?? '').trim(),
            quantity:
              t.quantity != null && Number.isFinite(Number(t.quantity))
                ? Number(t.quantity)
                : null,
          })).filter((c) => c.name),
        )
        : [],
      tagDraft: '',
    })
    setEditId(p.id); setSaveError(''); setModal(true)
  }

  function commitTagsFromDraft(chips, draft) {
    const list = [...(chips || [])]
    const tail = parseTagSegment(draft)
    if (tail) list.push(tail)
    return dedupeTagsForSave(list.map((t) => ({ name: t.name, quantity: t.quantity ?? null })))
  }

  function buildTagsPayload() {
    return commitTagsFromDraft(form.tagChips, form.tagDraft).map(({ name, quantity }) => ({
      name,
      quantity: quantity != null ? quantity : null,
    }))
  }

  function handleTagDraftChange(raw) {
    const text = raw != null ? String(raw) : ''
    if (!text.includes(',')) {
      setForm((f) => ({ ...f, tagDraft: text }))
      return
    }
    const parts = text.split(',')
    const draft = parts.pop() ?? ''
    const additions = parts.map(parseTagSegment).filter(Boolean)
    setForm((f) => ({
      ...f,
      tagChips: dedupeTagsForSave([...(f.tagChips || []), ...additions]),
      tagDraft: draft,
    }))
  }

  function removeTagChip(at) {
    setForm((f) => ({
      ...f,
      tagChips: (f.tagChips || []).filter((_, i) => i !== at),
    }))
  }

  async function save() {
    if (!form.name || !form.category || !form.price || form.costPrice === '' || form.costPrice === undefined) { setSaveError('Name, category, selling price, and cost price are required'); return }
    const tags = buildTagsPayload()
    const baseBody = {
      name: form.name,
      category: form.category,
      price: form.price,
      costPrice: form.costPrice,
      barcode: form.barcode?.trim() ? form.barcode.trim() : null,
      description: form.description || '',
    }
    await runSave(async () => {
      if (editId) {
        await api.put(`/products/${editId}`, { ...baseBody, tags })
      } else if (tags.length) {
        // Creation tags are treated as top-level variants, each becoming its own product.
        const createdNames = new Set()
        for (const t of tags) {
          const variantName = `${form.name} (${t.name})`
          const key = variantName.toLowerCase()
          if (createdNames.has(key)) continue
          createdNames.add(key)
          await api.post('/products', {
            ...baseBody,
            name: variantName,
            barcode: null,
            tags: [],
          })
        }
      } else {
        await api.post('/products', { ...baseBody, tags: [] })
      }
      setModal(false); load()
    })
  }

  async function remove(id) {
    if (!confirm('Remove this product?')) return
    await api.delete(`/products/${id}`)
    load()
  }

  // ── Export PDF ──
  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Products List', 14, 16)
    autoTable(doc, {
      startY: 22,
      head: [['#', 'Name', 'Category', 'Tags', 'Cost Price', 'Selling Price', 'Barcode', 'Stock']],
      body: filtered.map(p => [
        p.id, p.name, p.category,
        (p.tags || []).length === 0
          ? '—'
          : (p.tags || [])
              .map((t) =>
                t.quantity != null && Number.isFinite(Number(t.quantity))
                  ? `${t.name} (${t.quantity})`
                  : t.name
              )
              .join(', '),
        fmt(p.costPrice ?? 0),
        fmt(p.price),
        p.barcode || '—',
        p.inventory?.quantity ?? 0,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 102, 204] },
    })
    doc.save('products.pdf')
  }

  // ── Export Excel ──
  function exportExcel() {
    const rows = filtered.map(p => ({
      ID: p.id,
      Name: p.name,
      Category: p.category,
      Tags:
        (p.tags || []).length === 0
          ? ''
          : (p.tags || [])
              .map((t) =>
                t.quantity != null && Number.isFinite(Number(t.quantity))
                  ? `${t.name}=${t.quantity}`
                  : t.name
              )
              .join(', '),
      CostPrice: p.costPrice ?? 0,
      SellingPrice: p.price,
      Barcode: p.barcode || '',
      Stock: p.inventory?.quantity ?? 0,
      LowStockAlert: p.inventory?.lowStockAlert ?? 10,
      Supplier: p.inventory?.supplier || '',
      Description: p.description || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, 'products.xlsx')
  }

  function downloadImportTemplate() {
    downloadCsv(
      'product-import-template.csv',
      [
        'name,category,cost_price,selling_price,barcode,stock,low_stock_alert,supplier,description,tags',
        'T-Shirt Apparel,Apparel,120,180,,30,10,China,Optional notes,xl=10,lg=10,sm=10',
      ].join('\n') + '\n'
    )
  }

  // ── Import CSV/Excel ──
  function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        let imported = 0, skipped = 0
        const skipNotes = []
        for (const row of rows) {
          const r = normalizeSpreadsheetRow(row)
          const name = r.name
          const category = r.category
          const price = parseFloat(
            r.selling_price ?? r.sellingprice ?? r.price ?? r.sell_price ?? ''
          )
          const costPrice = parseFloat(r.cost_price ?? r.costprice ?? r.cost ?? '')
          if (!name || !category || Number.isNaN(price) || Number.isNaN(costPrice)) {
            skipped++
            continue
          }
          const bcRaw = r.barcode ?? r.upc ?? r.ean
          const barcode =
            bcRaw != null && String(bcRaw).trim() !== '' ? String(bcRaw).trim() : undefined
          const stockNum = parseInt(r.stock ?? r.quantity ?? r.qty ?? 0, 10) || 0
          const tagsCell = r.tags ?? r.tag_breakdown ?? r.variants ?? ''
          const tagsParsed = parseTagsColumn(tagsCell)
          const bdErr = tagsBreakdownStockError(tagsParsed, stockNum)
          if (bdErr) {
            skipped++
            if (skipNotes.length < 12) skipNotes.push(`${name}: ${bdErr}`)
            continue
          }
          const tagsPayload = tagsToApiPayload(tagsParsed)
          try {
            const basePayload = {
              name,
              category,
              price,
              costPrice,
              barcode,
              description: r.description ?? r.desc ?? '',
              quantity: stockNum,
              lowStockAlert: parseInt(r.low_stock_alert ?? r.lowstockalert ?? 10, 10) || 10,
              supplier: r.supplier ?? r.vendor ?? '',
            }
            if (tagsPayload.length) {
              const createdNames = new Set()
              for (const t of tagsPayload) {
                const variantName = `${name} (${t.name})`
                const key = variantName.toLowerCase()
                if (createdNames.has(key)) continue
                createdNames.add(key)
                await api.post('/products', {
                  ...basePayload,
                  name: variantName,
                  barcode: null,
                  tags: [],
                })
                imported++
              }
            } else {
              await api.post('/products', { ...basePayload, tags: [] })
              imported++
            }
          } catch { skipped++ }
        }
        await load()
        showInfo(
          `Import complete: ${imported} added, ${skipped} skipped.` +
            (skipNotes.length ? ` — ${skipNotes.join(' | ')}` : '')
        )
      } catch (err) {
        setImportError('Failed to parse file. Make sure it is a valid CSV or Excel file.')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      productDisplayName(p).toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(search)) ||
      p.category.toLowerCase().includes(q) ||
      (p.tags || []).some((t) => t.name && String(t.name).toLowerCase().includes(q))
    )
  })

  return (
    <div>
      <div className="section-header">
        <h2>All Products</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Export buttons */}
          <button className="btn btn-outline" onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileText size={14} strokeWidth={2} /> PDF
          </button>
          <button className="btn btn-outline" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileDown size={14} strokeWidth={2} /> Excel
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={downloadImportTemplate}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <FileDown size={14} strokeWidth={2} /> CSV template
              </button>
              <button className="btn btn-outline" onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileUp size={14} strokeWidth={2} /> Import
              </button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
              <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={15} strokeWidth={2.5} /> Add Product
              </button>
            </>
          )}
        </div>
      </div>

      {importError && <div className="error-message" style={{ marginBottom: 12 }}>{importError}</div>}
      {canEdit && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          <strong>Import</strong>: optional spreadsheet column{' '}
          <code style={{ fontSize: 12 }}>tags</code> (aliases:{' '}
          <code style={{ fontSize: 12 }}>tag_breakdown</code>,{' '}
          <code style={{ fontSize: 12 }}>variants</code>). Same rules as adding a product — comma-separated; use{' '}
          <code style={{ fontSize: 12 }}>XL=10</code> to put units on that tag. If any tag has a number, the{' '}
          <strong>sum of those numbers must equal the row stock</strong> so the breakdown matches total inventory.
        </p>
      )}

      <div className="search-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, tags, barcode or category…" style={{ paddingLeft: 36 }} />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Category</th><th>Tags</th><th>Cost Price</th><th>Selling Price</th><th>Barcode</th><th>Stock</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {tableLoading && <LoadingRow cols={canEdit ? 9 : 8} />}
            {!tableLoading && filtered.length === 0 && (
              <tr><td colSpan={canEdit ? 9 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No products found</td></tr>
            )}
            {!tableLoading && filtered.map(p => (
              <tr key={p.id}>
                <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{p.id}</td>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td><span className="badge badge-info">{p.category}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }}>
                  {(p.tags || []).length === 0
                    ? '—'
                    : (p.tags || [])
                        .map((t) =>
                          t.quantity != null && Number.isFinite(Number(t.quantity))
                            ? `${t.name} (${t.quantity})`
                            : t.name
                        )
                        .join(', ')}
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{fmt(p.costPrice ?? 0)}</td>
                <td style={{ fontWeight: 700 }}>{fmt(p.price)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{p.barcode || '—'}</td>
                <td>
                  <span className={`badge ${(p.inventory?.quantity ?? 0) <= (p.inventory?.lowStockAlert ?? 10) ? 'badge-warning' : 'badge-success'}`}>
                    {p.inventory?.quantity ?? 0}
                  </span>
                </td>
                {canEdit && (
                  <td>
                    <div className="action-group">
                      <button className="icon-btn primary" title="Edit" onClick={() => openEdit(p)}><Pencil size={13} strokeWidth={2} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => remove(p.id)}><Trash2 size={13} strokeWidth={2} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={editId ? 'Edit Product' : 'Add Product'}
          onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save}>Save Product</SaveBtn></>}
        >
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" autoFocus /></div>
            <div className="form-group"><label>Category *</label><input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Apparel" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Cost Price *</label><input type="number" step="0.01" min="0" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="0.00" /></div>
            <div className="form-group"><label>Selling Price *</label><input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Barcode (UPC-A)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="12-digit UPC-A" maxLength={12} style={{ flex: 1 }} />
                <button type="button" className="btn btn-outline" onClick={() => setForm(f => ({ ...f, barcode: generateUPCA() }))} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <Barcode size={14} strokeWidth={2} /> Generate
                </button>
              </div>
              <BarcodeDisplay value={form.barcode} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" /></div>
          </div>
          <div className="form-group">
            <label>Tags</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.4 }}>
              Type a variant, then <strong>comma</strong>—it becomes a chip. On create, each chip becomes its own
              product (e.g. <code style={{ fontSize: 11 }}>Jeans (Black)</code>,{' '}
              <code style={{ fontSize: 11 }}>Jeans (Blue)</code>).
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg-card, #fff)',
              }}
            >
              {(form.tagChips || []).map((c, idx) => (
                <span
                  key={`${c.name}-${idx}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: 'var(--primary-light, rgba(0,100,160,0.12))',
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    maxWidth: '100%',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                    {c.name}
                  </span>
                  <button
                    type="button"
                    className="icon-btn danger"
                    style={{ padding: 2 }}
                    aria-label={`Remove tag ${c.name}`}
                    onClick={() => removeTagChip(idx)}
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={form.tagDraft ?? ''}
                onChange={(e) => handleTagDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Backspace') return
                  if ((form.tagDraft || '').length) return
                  e.preventDefault()
                  setForm((f) => ({
                    ...f,
                    tagChips: (f.tagChips || []).slice(0, -1),
                  }))
                }}
                placeholder={
                  form.tagChips?.length ? 'Another variant…' : 'Black, Blue, White…'
                }
                style={{
                  flex: '1 0 140px',
                  minWidth: 120,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 14,
                }}
              />
            </div>
          </div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}

      {printOpen && <BarcodePrintSheet products={products} onClose={() => setPrintOpen(false)} />}
    </div>
  )
}

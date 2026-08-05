import { useMemo, useState } from 'react'
import { groupProductsBySize } from '../../utils/sizeBreakdown'

/**
 * Sales report body. SKUs carry their size as a name prefix
 * ("2XL-ALUO SHIRT (White)"), so instead of one flat row per SKU this shows one
 * block per product/colour with the sizes across the top and the quantity sold
 * under each — the layout the client signs off on. The top tabs switch to the
 * flat per-size lines for anyone reconciling figures.
 */
export default function SalesReportSection({ data, fmt }) {
  const rows = Array.isArray(data) ? data : []
  const [search, setSearch] = useState('')
  const [view, setView] = useState('grids')

  const groups = useMemo(
    () =>
      groupProductsBySize(
        rows.map((p) => ({
          name: p.name,
          category: p.category,
          quantity: p.totalQuantity,
          value: p.totalRevenue,
        })),
      ),
    [rows],
  )

  const q = search.trim().toLowerCase()
  const filtered = q
    ? groups.filter(
        (g) =>
          g.product.toLowerCase().includes(q) ||
          String(g.category ?? '').toLowerCase().includes(q) ||
          g.cells.some((c) => c.label.toLowerCase() === q),
      )
    : groups

  const totalQuantity = filtered.reduce((acc, g) => acc + g.totalQuantity, 0)
  const totalValue = filtered.reduce((acc, g) => acc + g.totalValue, 0)
  const sizeLines = filtered.reduce((acc, g) => acc + g.cells.length, 0)

  if (!rows.length) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
        No sales in this period.
      </p>
    )
  }

  return (
    <>
      <div className="history-sub-tabs">
        <button
          className={`history-sub-tab${view === 'grids' ? ' active' : ''}`}
          onClick={() => setView('grids')}
        >
          Size grids ({filtered.length})
        </button>
        <button
          className={`history-sub-tab${view === 'lines' ? ' active' : ''}`}
          onClick={() => setView('lines')}
        >
          Size lines ({sizeLines})
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Products sold</div><div className="stat-value">{filtered.length}</div></div>
        <div className="stat-card"><div className="stat-label">Size lines</div><div className="stat-value">{sizeLines}</div></div>
        <div className="stat-card"><div className="stat-label">Pieces sold</div><div className="stat-value">{totalQuantity}</div></div>
        <div className="stat-card success"><div className="stat-label">Revenue</div><div className="stat-value">{fmt(totalValue)}</div></div>
      </div>

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, colour, category or size…"
          style={{ width: '100%' }}
        />
      </div>

      {filtered.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>
          No products match this search.
        </p>
      )}

      {view === 'grids' && (
        <div className="size-groups">
          {filtered.map((g) => (
            <div className="size-group" key={g.key}>
              <div className="size-group-title">{g.product}</div>
              <div className="size-group-sub">
                {[g.category, `${g.totalQuantity} ${g.totalQuantity === 1 ? 'pc' : 'pcs'}`, fmt(g.totalValue)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className="size-group-scroll">
                <table className="size-grid">
                  <thead>
                    <tr>
                      <th>Size</th>
                      {g.cells.map((c) => <th key={c.label}>{c.label}</th>)}
                      <th className="size-total">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Qty</th>
                      {g.cells.map((c) => <td key={c.label}>{c.quantity}</td>)}
                      <td className="size-total">{g.totalQuantity}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'lines' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Size</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Qty sold</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.flatMap((g) =>
                g.cells.map((c) => (
                  <tr key={`${g.key}-${c.label}`}>
                    <td style={{ fontWeight: 600 }}>{g.product}</td>
                    <td>{c.label}</td>
                    <td><span className="badge badge-info">{g.category ?? '—'}</span></td>
                    <td style={{ textAlign: 'right' }}>{c.quantity}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(c.value)}</td>
                  </tr>
                )),
              )}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
                <td colSpan={3}>Total</td>
                <td style={{ textAlign: 'right' }}>{totalQuantity}</td>
                <td style={{ textAlign: 'right' }}>{fmt(totalValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}

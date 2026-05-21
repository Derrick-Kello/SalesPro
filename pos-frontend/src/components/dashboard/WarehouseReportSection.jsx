import { useMemo, useState } from 'react'
import { usePermissions } from '../../context/PermissionContext'
import { useAlert } from '../../context/AlertContext'
import { api } from '../../api/client'
import { useTableSelection } from '../../hooks/useTableSelection'
import { bulkDeleteLoop } from '../../utils/bulkDelete'
import {
  TableBulkBar,
  TableNumberCell,
  TableSelectCell,
  TableSelectHeader,
} from '../table/TableColumns'
import { Download, Printer } from 'lucide-react'

function filterRows(rows, search, fields) {
  const q = search.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) =>
    fields.some((fn) => String(fn(row) ?? '').toLowerCase().includes(q))
  )
}

function TableSearchInput({ value, onChange, placeholder }) {
  return (
    <div className="search-bar" style={{ marginBottom: 10 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
    </div>
  )
}

export default function WarehouseReportSection({ data, fmt, title, onDownloadCsv, onPrint, onRefresh }) {
  const { can } = usePermissions()
  const { showError, showSuccess } = useAlert()
  const canDeleteTransfers = can('transfers.delete')

  const [searchBalances, setSearchBalances] = useState('')
  const [searchProducts, setSearchProducts] = useState('')
  const [searchTransfers, setSearchTransfers] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const r = data.rollup || {}
  const sums = data.summaries || []
  const lines = data.productLines || []
  const xfers = data.transferHistory || []
  const te = data.transferEconomics || {}

  const filteredSums = useMemo(
    () =>
      filterRows(sums, searchBalances, [
        (row) => row.warehouseName,
        (row) => row.branchName,
        (row) => row.location,
        (row) => row.stockNote,
      ]),
    [sums, searchBalances]
  )

  const filteredLines = useMemo(
    () =>
      filterRows(lines, searchProducts, [
        (row) => row.name,
        (row) => row.category,
      ]),
    [lines, searchProducts]
  )

  const filteredXfers = useMemo(
    () =>
      filterRows(xfers, searchTransfers, [
        (row) => row.productName,
        (row) => row.fromLabel,
        (row) => row.toLabel,
        (row) => row.routeHint,
        (row) => row.note,
        (row) => row.transferredByName,
      ]),
    [xfers, searchTransfers]
  )

  const {
    selectedIds,
    toggle,
    toggleAll,
    allSelected,
    clear,
  } = useTableSelection(filteredXfers, (t) => t.id)

  const fmtDt = (iso) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—'

  async function deleteSelectedTransfers() {
    if (!selectedIds.length) return
    if (!confirm(`Delete ${selectedIds.length} transfer(s)? Stock movements will be reversed.`)) return
    setBulkDeleting(true)
    try {
      await bulkDeleteLoop(api, '/transfers', selectedIds)
      showSuccess(`Deleted ${selectedIds.length} transfer(s).`)
      clear()
      if (onRefresh) onRefresh()
    } catch (err) {
      showError(err.message || 'Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <>
      <div
        className="no-print-warehouse-report"
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'stretch',
          marginBottom: 20,
        }}
      >
        <div
          className="card"
          style={{
            flex: '1 1 280px',
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Export</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={onDownloadCsv}
            >
              <Download size={16} strokeWidth={2} /> Download CSV
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={onPrint}
            >
              <Printer size={16} strokeWidth={2} /> Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      <div id="warehouse-report-export-root">
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #warehouse-report-export-root, #warehouse-report-export-root * { visibility: visible !important; }
            #warehouse-report-export-root {
              position: absolute; left: 0; top: 0; width: 100%;
              padding: 12px;
            }
          }
        `}</style>

        <h1 style={{ fontSize: 22, margin: '0 0 14px', fontWeight: 800, letterSpacing: '-0.02em' }}>
          {title || 'Warehouse Report'}
        </h1>

        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, maxWidth: 800, lineHeight: 1.5 }}>
          Stock here is counted per warehouse (isolated ledger). Outlet stock only changes via Transfers —
          warehouse restock is handled under Purchase → Receive to warehouse or Warehouses → Stock.
        </p>

        {data.dateFiltered === true && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, maxWidth: 720 }}>
            Transfer history filtered from <strong>{data.startDate ?? '…'}</strong> to{' '}
            <strong>{data.endDate ?? '…'}</strong>.
          </p>
        )}
        {data.dateFiltered === false && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, maxWidth: 720 }}>
            Showing all recorded transfers (latest 750). Pick dates above and Filter to narrow economics and lists.
          </p>
        )}
        {r.rollupHint && (
          <div
            role="note"
            style={{
              border: '1px solid var(--warning)',
              background: 'var(--warning-light)',
              padding: '12px 14px',
              borderRadius: 10,
              marginBottom: 18,
              fontSize: 13,
              maxWidth: 720,
              lineHeight: 1.45,
            }}
          >
            {r.rollupHint}
          </div>
        )}

        <div className="stats-grid" style={{ marginBottom: 22 }}>
          <div className="stat-card"><div className="stat-label">Warehouses listed</div><div className="stat-value">{r.warehousesListed ?? sums.length ?? 0}</div></div>
          <div className="stat-card"><div className="stat-label">SKU lines (Σ rows)</div><div className="stat-value">{r.distinctSkusHedged ?? '—'}</div></div>
          <div className="stat-card"><div className="stat-label">Pieces on hand (Σ)</div><div className="stat-value">{r.totalPieces ?? 0}</div></div>
          <div className="stat-card success"><div className="stat-label">Warehouse stock value</div><div className="stat-value">{fmt(r.totalCostValue ?? 0)}</div></div>
        </div>

        <h3 style={{ margin: '8px 0 12px', fontSize: 15, fontWeight: 700 }}>Transfer economics (recorded cost)</h3>
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card"><div className="stat-label">Transfers in view</div><div className="stat-value">{te.totalLines ?? 0}</div></div>
          <div className="stat-card"><div className="stat-label">Total movement value</div><div className="stat-value">{fmt(te.totalCostRecorded ?? 0)}</div></div>
          <div className="stat-card"><div className="stat-label">WH outbound</div><div className="stat-value">{fmt(te.outboundFromWarehouseCost ?? 0)}</div></div>
          <div className="stat-card"><div className="stat-label">Inbound at WH</div><div className="stat-value">{fmt(te.inboundToWarehouseCost ?? 0)}</div></div>
        </div>

        <h3 style={{ margin: '8px 0 12px', fontSize: 15, fontWeight: 700 }}>Warehouse balances</h3>
        <TableSearchInput
          value={searchBalances}
          onChange={setSearchBalances}
          placeholder="Search warehouse, branch, note…"
        />
        <div className="table-container" style={{ marginBottom: lines.length ? 28 : 20 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>#</th>
                <th>Warehouse</th>
                <th>Linked outlet</th>
                <th style={{ textAlign: 'right' }}>SKU lines</th>
                <th style={{ textAlign: 'right' }}>Pieces</th>
                <th style={{ textAlign: 'right' }}>Value (cost)</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {filteredSums.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>
                    No warehouses match this filter.
                  </td>
                </tr>
              )}
              {filteredSums.map((row, idx) => (
                <tr key={row.warehouseId}>
                  <TableNumberCell index={idx} />
                  <td style={{ fontWeight: 600 }}>{row.warehouseName}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {row.branchName ?? '—'}{row.location ? ` · ${row.location}` : ''}
                  </td>
                  <td style={{ textAlign: 'right' }}>{row.distinctSkus ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>{row.totalPieces ?? 0}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(row.totalCostValue ?? 0)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 280 }}>
                    {row.stockNote ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lines.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Product detail (single warehouse)</h3>
            <TableSearchInput
              value={searchProducts}
              onChange={setSearchProducts}
              placeholder="Search product or category…"
            />
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>#</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit cost</th>
                    <th style={{ textAlign: 'right' }}>Line value</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
                        No products match search.
                      </td>
                    </tr>
                  )}
                  {filteredLines.map((p, idx) => (
                    <tr key={p.productId}>
                      <TableNumberCell index={idx} />
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td><span className="badge badge-info">{p.category ?? '—'}</span></td>
                      <td style={{ textAlign: 'right' }}>{p.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(p.unitCostPrice ?? 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.lineCostValue ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Transfer history</h3>
        <TableSearchInput
          value={searchTransfers}
          onChange={setSearchTransfers}
          placeholder="Search product, route, from, to, note…"
        />
        {canDeleteTransfers && (
          <TableBulkBar
            selectedCount={selectedIds.length}
            onDelete={deleteSelectedTransfers}
            onClear={clear}
            deleting={bulkDeleting}
            entityLabel="transfer"
          />
        )}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                {canDeleteTransfers && (
                  <TableSelectHeader
                    checked={allSelected}
                    disabled={!filteredXfers.length || bulkDeleting}
                    onChange={toggleAll}
                  />
                )}
                <th style={{ width: 44, textAlign: 'center' }}>#</th>
                <th>When</th>
                <th>Route</th>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th>From</th>
                <th>To</th>
                <th>By</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {filteredXfers.length === 0 && (
                <tr>
                  <td colSpan={canDeleteTransfers ? 11 : 10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>
                    No transfers found for this filter.
                  </td>
                </tr>
              )}
              {filteredXfers.map((t, idx) => (
                <tr key={t.id}>
                  {canDeleteTransfers && (
                    <TableSelectCell
                      checked={selectedIds.includes(t.id)}
                      disabled={bulkDeleting}
                      onChange={(c) => toggle(t.id, c)}
                    />
                  )}
                  <TableNumberCell index={idx} />
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDt(t.createdAt)}</td>
                  <td><span className="badge badge-info">{t.routeHint || 'Transfer'}</span></td>
                  <td style={{ fontWeight: 600 }}>{t.productName}</td>
                  <td style={{ textAlign: 'right' }}>{t.quantity}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(t.totalCostRecorded ?? 0)}</td>
                  <td>{t.fromLabel}</td>
                  <td>{t.toLabel}</td>
                  <td style={{ fontSize: 13 }}>{t.transferredByName ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180 }}>{t.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

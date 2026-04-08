export function LoadingRow({ cols }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
        <span className="spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid var(--border2)', borderTopColor: 'var(--primary)', borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' }} />
        Loading…
      </td>
    </tr>
  )
}

export function SaveBtn({ loading, children = 'Save', ...props }) {
  return (
    <button className="btn btn-primary" disabled={loading} {...props} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...(props.style || {}) }}>
      {loading && <span className="spin" style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} />}
      {loading ? 'Saving…' : children}
    </button>
  )
}

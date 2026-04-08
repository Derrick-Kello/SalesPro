import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { LogOut, ShoppingBag, GitBranch } from 'lucide-react'

const ROLE_LABELS = { ADMIN: 'Administrator', MANAGER: 'Manager', CASHIER: 'Cashier' }

function getInitials(fullName = '') {
  return fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export default function Navbar({ extra }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const branchCtx = useBranch()
  const [branches, setBranches] = useState([])

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api.get('/branches').then(setBranches).catch(() => {})
    }
  }, [user?.role])

  function handleLogout() { logout(); navigate('/login') }

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <div className="nav-brand-icon">
          <ShoppingBag size={17} color="white" strokeWidth={2.2} />
        </div>
        SalesPro
      </div>

      <div className="nav-links">
        {extra}

        {/* Branch selector — ADMIN only */}
        {user?.role === 'ADMIN' && branchCtx && branches.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GitBranch size={14} color="var(--text-muted)" strokeWidth={2} />
            <select
              value={branchCtx.selectedBranchId ?? ''}
              onChange={e => branchCtx.setSelectedBranchId(e.target.value ? parseInt(e.target.value) : null)}
              style={{ fontSize: 13, padding: '5px 10px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="">All Branches</option>
              {branches.filter(b => b.isActive).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="nav-user">
          <div className="nav-avatar">{getInitials(user?.fullName)}</div>
          <div className="nav-user-info">
            <span className="nav-user-name">{user?.fullName}</span>
            <span className="nav-user-role">{ROLE_LABELS[user?.role] ?? user?.role}</span>
          </div>
        </div>

        <button onClick={handleLogout} className="btn btn-ghost btn-sm" title="Sign out">
          <LogOut size={14} strokeWidth={2.2} /> Sign Out
        </button>
      </div>
    </nav>
  )
}

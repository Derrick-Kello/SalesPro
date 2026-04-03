import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { LogOut, ShoppingBag } from 'lucide-react'

const ROLE_LABELS = {
  ADMIN:   'Administrator',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
}

function getInitials(fullName = '') {
  return fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'
}

export default function Navbar({ extra }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

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

        <div className="nav-user">
          <div className="nav-avatar">{getInitials(user?.fullName)}</div>
          <div className="nav-user-info">
            <span className="nav-user-name">{user?.fullName}</span>
            <span className="nav-user-role">{ROLE_LABELS[user?.role] ?? user?.role}</span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-ghost btn-sm"
          title="Sign out"
        >
          <LogOut size={14} strokeWidth={2.2} />
          Sign Out
        </button>
      </div>
    </nav>
  )
}

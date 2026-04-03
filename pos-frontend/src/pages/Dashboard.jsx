import { useState } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import Overview   from '../components/dashboard/Overview'
import Products   from '../components/dashboard/Products'
import Inventory  from '../components/dashboard/Inventory'
import Customers  from '../components/dashboard/Customers'
import SalesHistory from '../components/dashboard/SalesHistory'
import Reports    from '../components/dashboard/Reports'
import Users      from '../components/dashboard/Users'
import {
  LayoutDashboard,
  Package2,
  Boxes,
  Users as UsersIcon,
  Receipt,
  BarChart3,
  UserCog,
} from 'lucide-react'

const SECTIONS = [
  { key: 'overview',  label: 'Overview',      icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER'] },
  { key: 'products',  label: 'Products',       icon: Package2,        roles: ['ADMIN', 'MANAGER'] },
  { key: 'inventory', label: 'Inventory',      icon: Boxes,           roles: ['ADMIN', 'MANAGER'] },
  { key: 'customers', label: 'Customers',      icon: UsersIcon,       roles: ['ADMIN', 'MANAGER'] },
  { key: 'sales',     label: 'Sales History',  icon: Receipt,         roles: ['ADMIN', 'MANAGER'] },
  { key: 'reports',   label: 'Reports',        icon: BarChart3,       roles: ['ADMIN', 'MANAGER'] },
  { key: 'users',     label: 'Users',          icon: UserCog,         roles: ['ADMIN'] },
]

const COMPONENTS = {
  overview:  Overview,
  products:  Products,
  inventory: Inventory,
  customers: Customers,
  sales:     SalesHistory,
  reports:   Reports,
  users:     Users,
}

export default function Dashboard() {
  const { user } = useAuth()
  const [active, setActive] = useState('overview')
  const Section = COMPONENTS[active]

  const visible = SECTIONS.filter(s => s.roles.includes(user?.role))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <div className="dashboard-layout">
        <aside className="sidebar">
          <div className="sidebar-section-label" style={{ marginTop: 4 }}>Menu</div>
          <ul className="sidebar-menu">
            {visible.map(s => {
              const Icon = s.icon
              return (
                <li key={s.key}>
                  <a
                    href="#"
                    className={active === s.key ? 'active' : ''}
                    onClick={e => { e.preventDefault(); setActive(s.key) }}
                  >
                    <Icon size={16} className="sidebar-icon" strokeWidth={active === s.key ? 2.2 : 1.8} />
                    {s.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </aside>

        <main className="dashboard-main">
          <Section />
        </main>
      </div>
    </div>
  )
}

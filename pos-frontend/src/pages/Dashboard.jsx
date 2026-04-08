import { useState, useRef } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { BranchProvider } from '../context/BranchContext'
import { ActiveTabContext } from '../hooks/useTabRefresh'
import Overview        from '../components/dashboard/Overview'
import Products        from '../components/dashboard/Products'
import ProductCategories from '../components/dashboard/ProductCategories'
import Inventory       from '../components/dashboard/Inventory'
import Customers       from '../components/dashboard/Customers'
import Suppliers       from '../components/dashboard/Suppliers'
import SalesHistory    from '../components/dashboard/SalesHistory'
import Reports         from '../components/dashboard/Reports'
import Users           from '../components/dashboard/Users'
import AllExpenses     from '../components/dashboard/AllExpenses'
import ExpenseCategories from '../components/dashboard/ExpenseCategories'
import Branches        from '../components/dashboard/Branches'
import Warehouses      from '../components/dashboard/Warehouses'
import CreateTransfer  from '../components/dashboard/CreateTransfer'
import Transfers       from '../components/dashboard/Transfers'
import {
  LayoutDashboard, Package2, Boxes, Users as UsersIcon,
  Receipt, BarChart3, UserCog, Menu, ChevronDown, ChevronRight,
  Truck, DollarSign, PlusCircle, Tag, FileText, TrendingUp,
  AlertTriangle, Warehouse, List, Printer, GitBranch, ArrowRightLeft,
} from 'lucide-react'

const SIDEBAR = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER'] },
  {
    label: 'Products', icon: Package2, roles: ['ADMIN', 'MANAGER'],
    children: [
      { key: 'products-all',        label: 'All Products',        icon: List },
      { key: 'products-create',     label: 'Create Product',      icon: PlusCircle },
      { key: 'products-labels',     label: 'Print Labels',        icon: Printer },
      { key: 'products-categories', label: 'Categories',          icon: Tag },
    ],
  },
  { key: 'inventory', label: 'Inventory', icon: Boxes, roles: ['ADMIN', 'MANAGER'] },
  { key: 'transfers',  label: 'Transfers',  icon: ArrowRightLeft, roles: ['ADMIN', 'MANAGER'] },
  { key: 'sales', label: 'Sales History', icon: Receipt, roles: ['ADMIN', 'MANAGER'] },
   { key: 'branches',   label: 'Branches',   icon: GitBranch,      roles: ['ADMIN'] },
  { key: 'warehouses', label: 'Warehouses', icon: Warehouse,      roles: ['ADMIN'] },
   
  
  {
    label: 'Expenses', icon: DollarSign, roles: ['ADMIN', 'MANAGER'],
    children: [
      { key: 'expenses-all',        label: 'All Expenses',       icon: FileText },
      { key: 'expenses-create',     label: 'Create Expense',     icon: PlusCircle },
      { key: 'expenses-categories', label: 'Expense Categories', icon: Tag },
    ],
  },
 
  {
    label: 'People', icon: UsersIcon, roles: ['ADMIN', 'MANAGER'],
    children: [
      { key: 'customers', label: 'Customers', icon: UsersIcon },
      { key: 'suppliers', label: 'Suppliers', icon: Truck },
      { key: 'users',     label: 'Users',     icon: UserCog, roles: ['ADMIN'] },
    ],
  },
    {
    label: 'Reports', icon: BarChart3, roles: ['ADMIN', 'MANAGER'],
    children: [
      { key: 'report-payments',    label: 'Payments',      icon: DollarSign },
      { key: 'report-sales',       label: 'Sales Report',  icon: Receipt },
      { key: 'report-profit-loss', label: 'Profit & Loss', icon: TrendingUp },
      { key: 'report-stock',       label: 'Stock Alerts',  icon: AlertTriangle },
      { key: 'report-users',       label: 'User Report',   icon: UserCog },
      { key: 'report-warehouse',   label: 'Warehouse',     icon: Warehouse },
    ],
  },
]

const REPORT_MAP = {
  'report-payments':    'payments',
  'report-sales':       'sales-report',
  'report-profit-loss': 'profit-loss',
  'report-stock':       'stock-alerts',
  'report-users':       'user-report',
  'report-warehouse':   'stock-alerts',
}

// Maps tab keys to their component. Products has multiple modes sharing the same
// component, so those are handled specially below.
const TAB_COMPONENTS = {
  'overview':            () => <Overview />,
  'products-all':        () => <Products mode="all" />,
  'products-create':     () => <Products mode="create" />,
  'products-labels':     () => <Products mode="labels" />,
  'products-categories': () => <ProductCategories />,
  'inventory':           () => <Inventory />,
  'customers':           () => <Customers />,
  'suppliers':           () => <Suppliers />,
  'sales':               () => <SalesHistory />,
  'users':               () => <Users />,
  'expenses-all':        () => <AllExpenses />,
  'expenses-create':     () => <AllExpenses />,
  'expenses-categories': () => <ExpenseCategories />,
  'branches':            () => <Branches />,
  'warehouses':          () => <Warehouses />,
  'transfers':           () => <Transfers />,
  'create-transfer':     () => <CreateTransfer />,
}

function KeepAlive({ active, visited }) {
  return (
    <>
      {[...visited].map(key => {
        const factory = TAB_COMPONENTS[key] || (REPORT_MAP[key] ? () => <Reports subSection={REPORT_MAP[key]} /> : null)
        if (!factory) return null
        return (
          <div key={key} style={{ display: key === active ? 'block' : 'none' }}>
            {factory()}
          </div>
        )
      })}
    </>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [active, setActive] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expanded, setExpanded] = useState({ Products: true, People: false, Reports: false, Expenses: false })
  const [visited, setVisited] = useState(() => new Set(['overview']))

  function toggleGroup(label) {
    setExpanded(e => ({ ...e, [label]: !e[label] }))
  }

  function navigate(key) {
    setActive(key)
    setSidebarOpen(false)
    setVisited(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  function isVisible(item) {
    const roles = item.roles || ['ADMIN', 'MANAGER', 'CASHIER']
    return roles.includes(user?.role)
  }

  return (
    <BranchProvider>
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar extra={
        <button className="btn btn-ghost btn-sm btn-icon nav-menu-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
          <Menu size={18} strokeWidth={2} />
        </button>
      } />
      <div className="dashboard-layout">
        <div className={`sidebar-overlay${sidebarOpen ? ' mobile-open' : ''}`} onClick={() => setSidebarOpen(false)} />

        <aside className={`sidebar${sidebarOpen ? ' mobile-open' : ''}`}>
          <div className="sidebar-section-label" style={{ marginTop: 4 }}>Menu</div>
          <ul className="sidebar-menu">
            {SIDEBAR.filter(isVisible).map(item => {
              if (!item.children) {
                const Icon = item.icon
                return (
                  <li key={item.key}>
                    <a href="#" className={active === item.key ? 'active' : ''}
                      onClick={e => { e.preventDefault(); navigate(item.key) }}>
                      <Icon size={16} className="sidebar-icon" strokeWidth={active === item.key ? 2.2 : 1.8} />
                      {item.label}
                    </a>
                  </li>
                )
              }

              // Group with children
              const Icon = item.icon
              const isOpen = expanded[item.label]
              const visibleChildren = item.children.filter(c => !c.roles || c.roles.includes(user?.role))
              const isChildActive = visibleChildren.some(c => c.key === active)

              return (
                <li key={item.label}>
                  <a href="#" className={`sidebar-group${isChildActive ? ' active' : ''}`}
                    onClick={e => { e.preventDefault(); toggleGroup(item.label) }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon size={16} className="sidebar-icon" strokeWidth={1.8} />
                      {item.label}
                    </span>
                    {isOpen ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
                  </a>
                  {isOpen && (
                    <ul className="sidebar-submenu">
                      {visibleChildren.map(child => {
                        const CIcon = child.icon
                        return (
                          <li key={child.key}>
                            <a href="#" className={active === child.key ? 'active' : ''}
                              onClick={e => { e.preventDefault(); navigate(child.key) }}>
                              <CIcon size={14} className="sidebar-icon" strokeWidth={active === child.key ? 2.2 : 1.8} />
                              {child.label}
                            </a>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </aside>

        <main className="dashboard-main">
          <ActiveTabContext.Provider value={active}>
            <KeepAlive active={active} visited={visited} />
          </ActiveTabContext.Provider>
        </main>
      </div>
    </div>
    </BranchProvider>
  )
}

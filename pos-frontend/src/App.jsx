import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CashierPage from './pages/CashierPage'
import PurchaseMotherDetailsPage from './pages/PurchaseMotherDetailsPage'
import { useAuth } from './context/AuthContext'
import { AuthProvider } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import { CurrencyProvider } from './context/CurrencyContext'
import { PermissionProvider } from './context/PermissionContext'
import { AlertProvider } from './context/AlertContext'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 560, margin: '10vh auto' }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#555', marginBottom: 12 }}>{String(this.state.err.message || this.state.err)}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '8px 14px', cursor: 'pointer' }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

function defaultPath(role) {
  return role === 'CASHIER' ? '/cashier' : '/dashboard'
}

function AppRoutes() {
  const { token, user } = useAuth()
  const dest = defaultPath(user?.role)
  return (
    <Routes>
      <Route path="/login" element={!token ? <Login /> : <Navigate to={dest} replace />} />
      <Route path="/dashboard" element={
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      } />
      <Route path="/cashier" element={
        <ProtectedRoute><CashierPage /></ProtectedRoute>
      } />
      <Route path="/dashboard/purchase-history/details" element={
        <ProtectedRoute><PurchaseMotherDetailsPage /></ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to={token ? dest : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <CurrencyProvider>
          <PermissionProvider>
            <BranchProvider>
              <AlertProvider>
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </AlertProvider>
            </BranchProvider>
          </PermissionProvider>
        </CurrencyProvider>
      </AuthProvider>
    </AppErrorBoundary>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CashierPage from './pages/CashierPage'
import { useAuth } from './context/AuthContext'
import { AuthProvider } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import { CurrencyProvider } from './context/CurrencyContext'
import { PermissionProvider } from './context/PermissionContext'

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
      <Route path="*" element={<Navigate to={token ? dest : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <PermissionProvider>
          <BranchProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </BranchProvider>
        </PermissionProvider>
      </CurrencyProvider>
    </AuthProvider>
  )
}

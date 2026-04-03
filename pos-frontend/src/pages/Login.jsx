import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { ShoppingBag, Zap, BarChart3, Users, ShieldCheck } from 'lucide-react'

const FEATURES = [
  { icon: Zap,          text: 'Lightning-fast checkout experience' },
  { icon: BarChart3,    text: 'Real-time analytics and reporting' },
  { icon: Users,        text: 'Customer loyalty management' },
  { icon: ShieldCheck,  text: 'Role-based access control' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.post('/auth/login', form)
      login(data)
      navigate(data.user.role === 'CASHIER' ? '/cashier' : '/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* ── Left: Brand Panel ── */}
      <div className="login-brand">
        <div className="login-brand-logo">
          <ShoppingBag size={26} color="white" strokeWidth={2} />
        </div>

        <h1>SalesPro</h1>
        <p className="login-brand-tagline">
          Modern point of sale built for growing businesses.
          Fast, reliable, and beautifully simple.
        </p>

        <div className="login-features">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div className="login-feature" key={text}>
              <div className="login-feature-icon">
                <Icon size={17} color="rgba(255,255,255,0.88)" strokeWidth={2} />
              </div>
              <span className="login-feature-text">{text}</span>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 'auto', paddingTop: 48, fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
          © 2025 SalesPro — All rights reserved
        </p>
      </div>

      {/* ── Right: Form Panel ── */}
      <div className="login-form-panel">
        <div className="login-form-inner">
          <div className="login-form-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Enter your username"
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
              style={{ marginTop: 8, padding: '11px 18px', fontSize: 14, fontWeight: 700 }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: 'var(--text-light)' }}>
            SalesPro POS v1.0
          </p>
        </div>
      </div>
    </div>
  )
}

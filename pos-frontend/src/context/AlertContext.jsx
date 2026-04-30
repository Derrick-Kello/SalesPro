import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AlertContext = createContext(null)

let seq = 1

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([])

  const dismiss = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const push = useCallback((input) => {
    const id = seq++
    const alert = {
      id,
      type: input.type || 'info',
      title: input.title || null,
      message: String(input.message || ''),
      durationMs: Number.isFinite(Number(input.durationMs)) ? Number(input.durationMs) : 3500,
    }
    setAlerts((prev) => [...prev, alert])
    if (alert.durationMs > 0) {
      window.setTimeout(() => dismiss(id), alert.durationMs)
    }
  }, [dismiss])

  const value = useMemo(() => ({
    show: push,
    showError: (message, title) => push({ type: 'error', title, message }),
    showSuccess: (message, title) => push({ type: 'success', title, message }),
    showInfo: (message, title) => push({ type: 'info', title, message }),
    dismiss,
  }), [push, dismiss])

  return (
    <AlertContext.Provider value={value}>
      {children}
      <AlertViewport alerts={alerts} onClose={dismiss} />
    </AlertContext.Provider>
  )
}

export function useAlert() {
  const ctx = useContext(AlertContext)
  if (!ctx) throw new Error('useAlert must be used inside AlertProvider')
  return ctx
}

function AlertViewport({ alerts, onClose }) {
  if (!alerts.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 'min(380px, calc(100vw - 24px))',
      }}
    >
      {alerts.map((a) => (
        <div
          key={a.id}
          role="status"
          style={{
            background: '#fff',
            border: '1px solid',
            borderColor: a.type === 'error' ? '#fecaca' : a.type === 'success' ? '#bbf7d0' : '#bfdbfe',
            borderLeft: `4px solid ${a.type === 'error' ? '#dc2626' : a.type === 'success' ? '#16a34a' : '#2563eb'}`,
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {a.title ? (
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{a.title}</div>
              ) : null}
              <div style={{ fontSize: 13, lineHeight: 1.35, wordBreak: 'break-word' }}>{a.message}</div>
            </div>
            <button
              type="button"
              onClick={() => onClose(a.id)}
              aria-label="Dismiss"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#6b7280',
                fontSize: 15,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}


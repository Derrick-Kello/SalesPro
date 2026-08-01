import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Download, RefreshCw, X } from 'lucide-react'

const barStyle = {
  position: 'fixed',
  left: 16,
  right: 16,
  bottom: 16,
  zIndex: 9000,
  margin: '0 auto',
  maxWidth: 460,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'var(--surface, #fff)',
  border: '1px solid var(--border, #E5E7EB)',
  boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
  fontSize: 13.5,
}

/**
 * Update + install prompts for the installed app.
 *
 * The service worker is registered with `prompt` semantics on purpose: a till
 * that reloads itself while a cart is open would lose the sale, so a new
 * version waits until the cashier chooses to apply it.
 */
export default function PWAPrompts() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url, reg) {
      // Tills stay open for days; poll so a deploy is noticed without a manual reload.
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })

  const [installEvent, setInstallEvent] = useState(null)
  const [installDismissed, setInstallDismissed] = useState(
    () => localStorage.getItem('pos-install-dismissed') === '1',
  )

  useEffect(() => {
    function onPrompt(e) {
      e.preventDefault()
      setInstallEvent(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setInstallEvent(null))
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  async function install() {
    if (!installEvent) return
    installEvent.prompt()
    await installEvent.userChoice.catch(() => {})
    setInstallEvent(null)
  }

  function dismissInstall() {
    setInstallDismissed(true)
    localStorage.setItem('pos-install-dismissed', '1')
  }

  if (needRefresh) {
    return (
      <div style={barStyle} role="status">
        <RefreshCw size={18} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--primary)' }} />
        <span style={{ flex: 1 }}>
          A new version is ready. Finish the current sale first — updating reloads the app.
        </span>
        <button type="button" className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
          Update
        </button>
        <button
          type="button"
          className="btn btn-outline"
          aria-label="Dismiss"
          onClick={() => setNeedRefresh(false)}
          style={{ padding: '6px 8px' }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    )
  }

  if (installEvent && !installDismissed) {
    return (
      <div style={barStyle} role="status">
        <Download size={18} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--primary)' }} />
        <span style={{ flex: 1 }}>
          Install SalesPro on this device to keep selling when the connection drops.
        </span>
        <button type="button" className="btn btn-primary" onClick={install}>
          Install
        </button>
        <button
          type="button"
          className="btn btn-outline"
          aria-label="Dismiss"
          onClick={dismissInstall}
          style={{ padding: '6px 8px' }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    )
  }

  return null
}

import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

/**
 * New-version prompt for the installed app.
 *
 * Registered with `prompt` semantics on purpose: a till that reloads itself
 * while a cart is open would lose the sale, so a waiting version sits until the
 * cashier applies it.
 *
 * Installing is handled by InstallButton in the navbar, not here — one owner
 * for the `beforeinstallprompt` event keeps the two from fighting over it.
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

  if (!needRefresh) return null

  return (
    <div className="pwa-update-bar" role="status">
      <RefreshCw size={18} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--primary)' }} />
      <span style={{ flex: 1 }}>
        A new version is ready. Finish the current sale first — updating reloads the app.
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => updateServiceWorker(true)}>
        Update
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        aria-label="Dismiss"
        onClick={() => setNeedRefresh(false)}
        style={{ padding: '6px 8px' }}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import Modal from './Modal'
import { getInstallState, promptInstall, subscribeInstall } from '../offline/installPrompt'

/**
 * Install-to-home-screen control.
 *
 * Renders as an icon in the navbar. On Android/desktop it fires the native
 * install sheet; on iOS Safari — which has no install API — it opens the
 * Add to Home Screen walkthrough, because a button that silently did nothing
 * is exactly what "I can't even download it" looks like.
 */
export default function InstallButton() {
  const [state, setState] = useState(getInstallState)
  const [howToOpen, setHowToOpen] = useState(false)

  useEffect(() => subscribeInstall(setState), [])

  // Already installed, or a browser that cannot install at all — no control.
  if (state.installed) return null
  if (!state.canPrompt && !state.needsIOSInstructions) return null

  async function onClick() {
    if (state.canPrompt) {
      await promptInstall()
      return
    }
    setHowToOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="install-btn"
        aria-label="Install SalesPro on this device"
        title="Install SalesPro on this device"
      >
        <Download size={17} strokeWidth={2.2} />
        <span className="install-btn-label">Install</span>
      </button>

      {howToOpen && (
        <Modal title="Add SalesPro to your Home Screen" onClose={() => setHowToOpen(false)}>
          <div style={{ maxWidth: 380, fontSize: 14.5, lineHeight: 1.55 }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 18 }}>
              iPhone and iPad install apps from the Share menu rather than a button. It takes
              three taps:
            </p>

            <Step n={1} icon={<Share size={19} strokeWidth={2} />}>
              Tap the <strong>Share</strong> button in Safari&apos;s toolbar — the square with an
              arrow pointing up, at the bottom of the screen.
            </Step>
            <Step n={2} icon={<SquarePlus size={19} strokeWidth={2} />}>
              Scroll down the list and tap <strong>Add to Home Screen</strong>.
            </Step>
            <Step n={3} icon={<Download size={19} strokeWidth={2} />}>
              Tap <strong>Add</strong>. SalesPro appears on your Home Screen and opens full
              screen, with offline selling enabled.
            </Step>

            <p
              style={{
                marginTop: 18,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--surface2)',
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              This only works in <strong>Safari</strong>. If you are in Chrome or another browser
              on iPhone, open this page in Safari first.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}

function Step({ n, icon, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <div
        aria-hidden
        style={{
          flexShrink: 0,
          width: 34,
          height: 34,
          borderRadius: 10,
          background: 'var(--primary-light)',
          color: 'var(--primary)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.04em' }}>
          STEP {n}
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

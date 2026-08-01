import { useEffect, useState } from 'react'
import { Apple, Check, Download, Share, SquarePlus, Smartphone, TabletSmartphone, TriangleAlert } from 'lucide-react'
import { getInstallState, promptInstall, subscribeInstall } from '../offline/installPrompt'

/**
 * Full install walkthrough for the Settings screen.
 *
 * Unlike the navbar icon, this never hides itself behind platform detection:
 * every platform's steps are always on screen, with the detected one called
 * out. If detection is ever wrong — or the browser simply never offers an
 * install event — someone can still follow the instructions by hand.
 */
export default function InstallGuide() {
  const [state, setState] = useState(getInstallState)
  useEffect(() => subscribeInstall(setState), [])

  return (
    <div style={{ maxWidth: 620 }}>
      <StatusBanner state={state} />

      {state.canPrompt && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={promptInstall}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}
        >
          <Download size={17} strokeWidth={2.2} /> Install SalesPro now
        </button>
      )}

      <Platform
        icon={<Apple size={17} strokeWidth={2} />}
        title="iPhone & iPad"
        highlight={state.needsIOSInstructions || state.iosUnsupportedBrowser}
      >
        {state.iosUnsupportedBrowser && (
          <p style={{ ...warnBox, marginBottom: 12 }}>
            <TriangleAlert size={15} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              You are not in Safari. iPhone only allows installing from <strong>Safari</strong> —
              open this page there first, then follow the steps below.
            </span>
          </p>
        )}
        <Step n={1} icon={<Share size={17} strokeWidth={2} />}>
          Tap the <strong>Share</strong> button — the square with an arrow pointing up. It is at the
          <strong> bottom</strong> of the screen on iPhone, top-right on iPad.
        </Step>
        <Step n={2} icon={<SquarePlus size={17} strokeWidth={2} />}>
          Scroll the list and tap <strong>Add to Home Screen</strong>.
        </Step>
        <Step n={3} icon={<Check size={17} strokeWidth={2} />}>
          Tap <strong>Add</strong>. SalesPro appears on the Home Screen and opens full screen,
          with offline selling enabled.
        </Step>
      </Platform>

      <Platform
        icon={<TabletSmartphone size={17} strokeWidth={2} />}
        title="Android"
        highlight={state.canPrompt}
      >
        <Step n={1} icon={<Download size={17} strokeWidth={2} />}>
          Tap <strong>Install SalesPro now</strong> above if it is showing. If not, open Chrome&apos;s
          menu (<strong>⋮</strong>, top-right).
        </Step>
        <Step n={2} icon={<SquarePlus size={17} strokeWidth={2} />}>
          Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </Step>
        <Step n={3} icon={<Check size={17} strokeWidth={2} />}>
          Confirm with <strong>Install</strong>.
        </Step>
      </Platform>

      <UpdateSection />

      <Platform icon={<Smartphone size={17} strokeWidth={2} />} title="Not seeing the option?">
        <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7, fontSize: 13.5 }}>
          <li>
            <strong>The app may be serving an old cached copy.</strong> Close every SalesPro tab,
            then reopen. If it still looks unchanged, use Safari&apos;s{' '}
            <em>Settings → Safari → Clear History and Website Data</em>, or Chrome&apos;s{' '}
            <em>Site settings → Clear &amp; reset</em>, and load the page again.
          </li>
          <li>
            The site must be served over <strong>HTTPS</strong>. Install is disabled on plain
            <code style={code}>http://</code> (except <code style={code}>localhost</code>).
          </li>
          <li>Private / Incognito windows cannot install.</li>
          <li>If it is already installed, the option disappears — check your Home Screen first.</li>
        </ul>
      </Platform>
    </div>
  )
}

/**
 * Manual update control.
 *
 * The service worker is registered with `prompt` semantics so a till cannot
 * reload itself mid-sale — the trade-off is that a device which never sees the
 * update bar keeps serving the cached build indefinitely, which looks exactly
 * like a missing feature. This gives an explicit way out.
 */
function UpdateSection() {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function checkForUpdate() {
    setBusy(true)
    setStatus('')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (!reg) {
        setStatus('No service worker registered — you are on a plain browser tab, always live.')
        return
      }
      await reg.update()
      // A waiting worker means a newer build is downloaded and ready.
      const waiting = reg.waiting
      if (waiting) {
        setStatus('A newer version is ready. Applying it will reload the app.')
        window.__spWaiting = waiting
      } else {
        setStatus('You are running the latest version.')
      }
    } catch (err) {
      setStatus(`Could not check: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  function applyUpdate() {
    const waiting = window.__spWaiting
    if (!waiting) return
    waiting.postMessage({ type: 'SKIP_WAITING' })
    waiting.addEventListener('statechange', (e) => {
      if (e.target.state === 'activated') window.location.reload()
    })
    // Fallback if the state event never lands.
    setTimeout(() => window.location.reload(), 1500)
  }

  return (
    <Platform icon={<Download size={17} strokeWidth={2} />} title="App version & updates">
      <p style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 10, color: 'var(--text-muted)' }}>
        This device is running the build from{' '}
        <strong style={{ color: 'var(--text)' }}>{typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'unknown'}</strong>.
        If a feature you expect is missing, this device is probably still serving a cached
        version — check here first.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={checkForUpdate} disabled={busy}>
          {busy ? 'Checking…' : 'Check for updates'}
        </button>
        {status.startsWith('A newer version') && (
          <button type="button" className="btn btn-primary btn-sm" onClick={applyUpdate}>
            Update &amp; reload
          </button>
        )}
      </div>
      {status && (
        <p style={{ fontSize: 13, marginTop: 10, color: 'var(--text-muted)' }}>{status}</p>
      )}
      <p style={{ ...warnBox, marginTop: 12, fontSize: 12.5 }}>
        <TriangleAlert size={15} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Finish any open sale before updating — applying an update reloads the app.</span>
      </p>
    </Platform>
  )
}

function StatusBanner({ state }) {
  if (state.installed) {
    return (
      <div style={{ ...box, borderColor: 'var(--success)', background: 'var(--success-light)', marginBottom: 20 }}>
        <Check size={18} strokeWidth={2.4} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <span>
          <strong>SalesPro is installed on this device.</strong> You are running the installed app
          right now — offline selling is active.
        </span>
      </div>
    )
  }
  return (
    <p style={{ color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.55, marginBottom: 20 }}>
      Installing puts SalesPro on the Home Screen and lets it run full screen. It is the same app —
      but an installed till keeps selling when the connection drops, queueing sales until it
      reconnects.
    </p>
  )
}

function Platform({ icon, title, highlight, children }) {
  return (
    <section
      style={{
        border: `1px solid ${highlight ? 'var(--primary)' : 'var(--border)'}`,
        background: highlight ? 'var(--primary-light)' : 'var(--surface)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 14,
      }}
    >
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, margin: '0 0 12px' }}>
        {icon} {title}
        {highlight && (
          <span
            style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 8px',
              borderRadius: 999, background: 'var(--primary)', color: '#fff',
            }}
          >
            YOUR DEVICE
          </span>
        )}
      </h4>
      {children}
    </section>
  )
}

function Step({ n, icon, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
      <div
        aria-hidden
        style={{
          flexShrink: 0, width: 30, height: 30, borderRadius: 9,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--primary)', display: 'grid', placeItems: 'center',
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, paddingTop: 4 }}>
        <strong style={{ color: 'var(--primary)', marginRight: 6 }}>{n}.</strong>
        {children}
      </div>
    </div>
  )
}

const box = { display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.5 }
const warnBox = { ...box, borderColor: 'var(--warning)', background: 'var(--warning-light)' }
const code = { background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }

/**
 * Install-to-home-screen support across platforms.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt` and let us trigger the native
 * sheet. iOS Safari never fires it and exposes no install API at all — the only
 * route is Share → Add to Home Screen, done by hand. So on iOS we detect the
 * situation and show instructions instead of a button that cannot work.
 */

let deferredPrompt = null
const listeners = new Set()

function emit() {
  for (const fn of listeners) {
    try { fn(getInstallState()) } catch { /* ignore */ }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // iPadOS 13+ reports as Macintosh, so touch support disambiguates it.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** Add to Home Screen exists only in Safari; other iOS browsers cannot install. */
export function isIOSSafari() {
  if (!isIOS()) return false
  const ua = navigator.userAgent || ''
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua)
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function getInstallState() {
  const installed = isStandalone()
  return {
    installed,
    /** Native prompt available — one tap installs. */
    canPrompt: !installed && !!deferredPrompt,
    /** iOS Safari — must be talked through Share → Add to Home Screen. */
    needsIOSInstructions: !installed && isIOS() && isIOSSafari(),
    /** An iOS browser that simply cannot install. */
    iosUnsupportedBrowser: !installed && isIOS() && !isIOSSafari(),
  }
}

export function subscribeInstall(fn) {
  listeners.add(fn)
  fn(getInstallState())
  return () => listeners.delete(fn)
}

/** Fire the native install sheet. Resolves to true if the user accepted. */
export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const choice = await deferredPrompt.userChoice.catch(() => null)
  deferredPrompt = null
  emit()
  return choice?.outcome === 'accepted'
}

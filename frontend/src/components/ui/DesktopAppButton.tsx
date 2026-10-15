// "Download the desktop app" link for the top-right corner of the portal on a
// PC. The desktop app (see desktop_app_plan.md) is not built yet, so the
// button stays hidden until a release exists: set DESKTOP_APP_URL to the
// installer's address (a GitHub Releases asset in the desktop app's own repo)
// and flip DESKTOP_APP_READY.

export const DESKTOP_APP_READY = false
export const DESKTOP_APP_URL = // Placeholder: the app lives in its own repo; correct this when that repo exists.
  'https://github.com/ashlerick/BPO-Time/releases/latest/download/BPO-Time-Setup.exe'

// The first version is Windows only, and there is nothing to download when
// the portal is already running inside the app itself.
function canInstallHere(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Windows/i.test(ua) && !/Electron|BPOTime/i.test(ua)
}

export function DesktopAppButton() {
  if (!DESKTOP_APP_READY || !canInstallHere()) return null
  return (
    <a
      href={DESKTOP_APP_URL}
      download
      title="Download the BPO Time desktop app for Windows"
      className="flex items-center gap-2 rounded-xl border border-white/15 bg-brand-950/85 px-3 py-2 text-xs font-semibold text-gray-100 shadow-lg backdrop-blur transition hover:bg-brand-950"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
        <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Desktop app
    </a>
  )
}

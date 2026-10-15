import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

// A round button pinned to the bottom-right corner on phones, one tap from
// anywhere to the inventory QR scanner (with the camera already starting).
// Hidden on larger screens, for anyone who can't open Inventory, and on the
// Inventory page itself, which has its own Scan QR button.
export function QuickScanButton() {
  const { effectiveRoles } = useAuth()
  const { pathname } = useLocation()
  const allowed = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  if (!allowed || pathname === '/inventory') return null

  return (
    <Link
      to="/inventory?tab=scan"
      aria-label="Scan an item's QR code"
      className="fixed bottom-5 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl shadow-black/40 active:scale-95 md:hidden"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7" aria-hidden="true">
        <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" strokeLinecap="round" />
        <path d="M9 9h2v2H9zM13 9h2v2h-2zM9 13h2v2H9zM14 14h1v1h-1z" fill="currentColor" stroke="none" />
      </svg>
    </Link>
  )
}

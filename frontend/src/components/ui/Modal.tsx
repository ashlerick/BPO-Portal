import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// A centered dialog over the whole window. It renders at the page root
// (a portal), because inside a card with a blur or transform a "fixed"
// element is positioned against that card instead of the window.
//
// Clicking outside does NOT close it by default: a form modal has a Cancel
// button, and losing typed data to a stray click is worse than one extra
// click. Escape still closes it. Pass `closeOnBackdrop` for read-only
// pop-ups with nothing to lose (such as the QR viewer).
export function Modal({
  label,
  onClose,
  closeOnBackdrop = false,
  children,
  className = 'max-w-lg',
}: {
  label: string
  onClose: () => void
  closeOnBackdrop?: boolean
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={closeOnBackdrop ? onClose : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-2xl border border-black/10 bg-white p-5 text-gray-900 shadow-2xl dark:border-white/10 dark:bg-gray-900 dark:text-gray-100 ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

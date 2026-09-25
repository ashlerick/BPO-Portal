import type { ReactNode } from 'react'

// A label above a control, the pattern every form in the app repeats.
export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 ${className}`}>
      {label}
      {children}
    </label>
  )
}

export function FormError({ message }: { message: string | null }) {
  return message ? <p className="text-sm text-red-600 dark:text-red-400">{message}</p> : null
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

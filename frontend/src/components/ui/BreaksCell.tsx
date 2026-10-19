import { breakLines, type BreakEntry } from '../../utils/breaks'

// A day's breaks and lunch, one small line each; one that ran over its limit is amber. A dash when none were recorded.
export function BreaksCell({ breaks }: { breaks?: BreakEntry[] }) {
  const lines = breakLines(breaks)
  if (lines.length === 0) return <span>—</span>
  return (
    <ul className="space-y-0.5 text-xs">
      {lines.map((l) => (
        <li key={l.label} className={l.over ? 'text-amber-700 dark:text-amber-500' : ''}>
          <span className="text-gray-500 dark:text-gray-400">{l.label}</span> {l.text}
        </li>
      ))}
    </ul>
  )
}

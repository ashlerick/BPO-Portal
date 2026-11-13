import { useLayoutEffect, useRef, useState } from 'react'
import { input } from './foaUi'
import { caretAfterMask, formatMoney, formatWhole, maskMoney, maskWhole, parseMasked } from './numberMask'

// A number field that shows commas as you type: "1230033" becomes "1,230,033" and the caret stays where you were typing. Money shows a $
// and settles to two decimals when you leave the field. The stored value is a plain number, or undefined while the field is empty.
export function MaskedInput({
  kind,
  value,
  onChange,
  label,
  placeholder,
}: {
  kind: 'money' | 'whole'
  value: number | undefined
  onChange: (next: number | undefined) => void
  label: string
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  // null while the field is not being edited, so it shows the stored value in full form
  const [typing, setTyping] = useState<string | null>(null)
  const mask = kind === 'money' ? maskMoney : maskWhole
  const stored = kind === 'money' ? formatMoney(value) : formatWhole(value)

  useLayoutEffect(() => {
    if (caret.current != null) {
      ref.current?.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  })

  return (
    <div className="relative min-w-0">
      {kind === 'money' && (
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
          $
        </span>
      )}
      <input
        ref={ref}
        type="text"
        inputMode={kind === 'money' ? 'decimal' : 'numeric'}
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder ?? (kind === 'money' ? '0.00' : '0')}
        value={typing ?? stored}
        onFocus={() => setTyping(stored)}
        onBlur={() => setTyping(null)}
        onChange={(e) => {
          const raw = e.target.value
          const masked = mask(raw)
          caret.current = caretAfterMask(raw, e.target.selectionStart ?? raw.length, masked)
          setTyping(masked)
          onChange(parseMasked(masked))
        }}
        className={`${input} text-right tabular-nums ${kind === 'money' ? 'pl-7' : ''}`}
      />
    </div>
  )
}

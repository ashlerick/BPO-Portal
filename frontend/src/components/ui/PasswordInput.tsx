import { useState, type InputHTMLAttributes } from 'react'

// A password field with a show/hide toggle. Used for every password
// input in the app so the behaviour and look stay identical. The eye
// button is a real <button type="button"> (never submits the form), is
// keyboard-focusable, and announces its state via aria-pressed.
export function PasswordInput({
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  const label = visible ? 'Hide password' : 'Show password'

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        // Once revealed it's a plain text input, so keep the keyboard from
        // "helping" (capitalising, autocorrecting) with what was typed.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`field pr-12 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Keeps the caret in the field instead of blurring it on desktop.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {visible ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <path d="M1 1l22 22" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  )
}

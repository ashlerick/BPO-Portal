import { useId } from 'react'

// A file input that looks like a button plus the chosen file's name. The
// native input is hidden (browsers style it as bare text), so this reads
// as something you can click on every theme.
export function FilePicker({
  file,
  onChange,
  accept,
  disabled,
  label = 'Choose file',
}: {
  file: File | undefined
  onChange: (file: File | undefined) => void
  accept?: string
  disabled?: boolean
  label?: string
}) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label
        htmlFor={id}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-brand-500/60 bg-brand-500/15 px-3.5 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-500/25 focus-within:ring-2 focus-within:ring-brand-500 dark:text-brand-300 ${
          disabled ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M10 2a1 1 0 011 1v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3a1 1 0 011-1zM4 15a1 1 0 011 1v1h10v-1a1 1 0 112 0v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a1 1 0 011-1z" transform="rotate(180 10 10)" />
        </svg>
        {file ? 'Change file' : label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0])}
      />
      <span className="min-w-0 truncate text-sm text-gray-600 dark:text-gray-300">{file ? file.name : 'No file chosen'}</span>
      {file && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs text-gray-500 underline hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Remove
        </button>
      )}
    </div>
  )
}

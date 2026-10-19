import { useState, type ReactNode } from 'react'

// Announcement text with light formatting, rendered as React elements (never as HTML, so nothing typed can run):
//   **bold**   *italic* or _italic_   a line starting with "- " or "• " is a bullet   https://links become links
// Line breaks are kept. With `clamp`, a long text is cut short with a "Read more" button.

const INLINE = /(https?:\/\/[^\s<]+|\*\*[^*\n]+\*\*|(?<![\w*])\*[^*\n]+\*(?![\w*])|(?<![\w])_[^_\n]+_(?![\w]))/g

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null
    const k = `${key}-${i}`
    if (/^https?:\/\//.test(part)) {
      // trailing punctuation is not part of the link
      const m = part.match(/^(.*?)([.,;:!?)]*)$/)
      const url = m ? m[1] : part
      const tail = m ? m[2] : ''
      return (
        <span key={k}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline dark:text-brand-400">
            {url}
          </a>
          {tail}
        </span>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>
    if ((part.startsWith('*') && part.endsWith('*') && part.length > 2) || (part.startsWith('_') && part.endsWith('_') && part.length > 2)) {
      return <em key={k}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

function blocks(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let bullets: string[] = []
  const flush = (at: number) => {
    if (bullets.length === 0) return
    out.push(
      <ul key={`ul-${at}`} className="my-1 list-disc space-y-0.5 pl-5">
        {bullets.map((b, i) => (
          <li key={i}>{inline(b, `b${at}-${i}`)}</li>
        ))}
      </ul>,
    )
    bullets = []
  }
  text.split('\n').forEach((line, i) => {
    const bullet = line.match(/^\s*(?:-|•)\s+(.*)$/)
    if (bullet) {
      bullets.push(bullet[1])
      return
    }
    flush(i)
    out.push(
      <div key={`l-${i}`} className={line.trim() === '' ? 'h-2' : undefined}>
        {line.trim() === '' ? null : inline(line, `l${i}`)}
      </div>,
    )
  })
  flush(text.length)
  return out
}

export function FormattedText({ text, className = '', clamp = false }: { text: string; className?: string; clamp?: boolean }) {
  const [open, setOpen] = useState(false)
  const long = clamp && (text.length > 320 || text.split('\n').length > 7)
  return (
    <div className={className}>
      <div className={`break-words ${long && !open ? 'max-h-36 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]' : ''}`}>{blocks(text)}</div>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-medium text-brand-700 underline dark:text-brand-400">
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

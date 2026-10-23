import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState } from '../../components/AsyncState'
import { Badge } from '../../components/ui/Badge'
import { FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { api, ApiError } from '../../services/api'
import { useToast } from '../../components/ui/Toast'

interface Post {
  id: string
  body: string
  alias: string
  emoji: string
  hidden: boolean
  createdAt: string
  reactions: Record<string, number>
  mine: string | null
}

const REACTIONS = ['😂', '❤️', '👏', '🔥', '😮'] as const

// Sticky-note colours, picked from the name so a name always has the same
// colour. Always light paper with dark text, like a real note, in both themes.
const NOTES = [
  'bg-yellow-200 border-yellow-300',
  'bg-pink-200 border-pink-300',
  'bg-emerald-200 border-emerald-300',
  'bg-sky-200 border-sky-300',
  'bg-violet-200 border-violet-300',
  'bg-orange-200 border-orange-300',
  'bg-lime-200 border-lime-300',
  'bg-teal-200 border-teal-300',
]
const TILTS = ['-rotate-1', 'rotate-0', 'rotate-1', '-rotate-[0.5deg]', 'rotate-[0.5deg]']

function hashOf(text: string): number {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

// Emoji offered by the picker (a phone's own keyboard can still type any emoji).
const PICKER_EMOJI = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩', '🥳', '😅', '😉', '😋',
  '🤔', '😴', '😭', '😢', '😡', '🤯', '😱', '🙃', '😇', '🤗', '🫡', '🙄',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👀', '🫶', '✌️', '🤞', '👋',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '✨', '🔥', '💯', '🎉',
  '🎂', '🍕', '☕', '🍔', '🍜', '🍰', '🍺', '🌮', '🌈', '☀️', '🌙', '⭐',
  '💡', '📣', '🎶', '🏆', '🚀', '💼', '🏠', '🛠️', '📚', '🐶', '🐱', '🐨',
] as const

const PAGE_SIZE = 24

const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

export function FreedomWallPage() {
  const { effectiveRoles } = useAuth()
  const isHr = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  // One page at a time (newest first). The server returns one extra row,
  // which only tells us whether older notes exist.
  const fetchPage = useCallback(async (before?: string) => {
    const qs = `limit=${PAGE_SIZE}${before ? `&before=${encodeURIComponent(before)}` : ''}`
    const rows = await api.get<Post[]>(`/hr/freedom-wall?${qs}`)
    return { page: rows.slice(0, PAGE_SIZE), more: rows.length > PAGE_SIZE }
  }, [])

  useEffect(() => {
    fetchPage()
      .then(({ page, more }) => {
        setPosts(page)
        setHasMore(more)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the wall'))
  }, [fetchPage])

  async function showOlder() {
    const last = posts?.[posts.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const { page, more } = await fetchPage(last.createdAt)
      setPosts((prev) => (prev ? [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))] : page))
      setHasMore(more)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load older notes')
    } finally {
      setLoadingMore(false)
    }
  }

  // Optimistic: the count moves at once, and rolls back if the server says no.
  async function react(post: Post, emoji: string | null) {
    const before = posts
    setPosts((prev) =>
      prev
        ? prev.map((x) => {
            if (x.id !== post.id) return x
            const reactions = { ...x.reactions }
            if (x.mine) reactions[x.mine] = Math.max(0, (reactions[x.mine] ?? 1) - 1)
            if (emoji) reactions[emoji] = (reactions[emoji] ?? 0) + 1
            return { ...x, reactions, mine: emoji }
          })
        : prev,
    )
    try {
      const fresh = await api.post<Post>(`/hr/freedom-wall/${post.id}?action=react`, { emoji })
      setPosts((prev) => prev?.map((x) => (x.id === fresh.id ? fresh : x)) ?? prev)
    } catch (err) {
      setPosts(before)
      toast.error(err instanceof ApiError ? err.message : 'Could not save your reaction')
    }
  }

  function insertEmoji(emoji: string) {
    const el = areaRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    const next = body.slice(0, start) + emoji + body.slice(end)
    if (next.length > 1000) return
    setBody(next)
    // put the caret right after the emoji once React has re-rendered
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  // close the picker on Escape or a click anywhere outside it
  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickerOpen(false)
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [pickerOpen])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (body.trim() === '') {
      setError('Your note is still blank. Write something for the wall first ✍️')
      areaRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<Post>('/hr/freedom-wall', { body })
      setPosts((prev) => [created, ...(prev ?? [])])
      setBody('')
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      toast.success('Posted anonymously')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post')
    } finally {
      setBusy(false)
    }
  }

  return (
    // Fills the window below the app header: the title and the note stay put
    // and only the wall of notes scrolls. (10.5rem = phone header + clock
    // strip + page padding; 3rem = page padding on larger screens.)
    <div className="flex h-[calc(100svh-10.5rem)] flex-col md:h-[calc(100svh-3rem)]">
      <PageHeader title="Freedom Wall" description="Post anonymously. Nobody — including HR — can see who wrote a post." />
      <form
        onSubmit={submit}
        className="relative z-30 mb-4 w-full max-w-xl shrink-0 -rotate-[0.5deg] rounded-md border border-yellow-300 bg-yellow-100 p-4 text-gray-900 shadow-md shadow-black/30 transition focus-within:rotate-0 focus-within:shadow-lg"
      >
        <textarea
          ref={areaRef}
          maxLength={1000}
          rows={2}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            if (error) setError(null)
          }}
          placeholder="Share a thought, idea or concern…"
          className="no-focus-ring block w-full resize-none rounded border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-0"
        />
        <FormError message={error} />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-label="Add an emoji"
              aria-expanded={pickerOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/20 bg-white/70 text-xl hover:bg-white"
            >
              😊
            </button>
            <span className="text-xs tabular-nums text-gray-600">{body.length} / 1000</span>
            {pickerOpen && (
              <div
                role="dialog"
                aria-label="Choose an emoji"
                className="absolute left-3 top-full z-20 mt-2 max-h-[60svh] w-[min(20rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-black/15 bg-white p-2 shadow-xl"
              >
                <div className="grid grid-cols-8 gap-0.5">
                  {PICKER_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="flex h-9 items-center justify-center rounded-md text-xl hover:bg-gray-100 active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white shadow transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Posting…' : 'Post anonymously'}
          </button>
        </div>
      </form>

      <div ref={listRef} className="wall-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-6 pt-2">
        {!posts && !error && null}
        {posts && posts.length === 0 && <EmptyState label="No posts yet. Be the first." />}
        {posts && (
          // CSS columns give the notes a masonry wall: one column on a phone.
          <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => {
              const h = hashOf(p.id)
              return (
                <li key={p.id}>
                  <div
                    className={`note-pop rounded-md border p-4 text-gray-900 shadow-md shadow-black/30 transition-transform duration-200 [animation:note-pop_0.35s_ease-out] hover:rotate-0 hover:scale-[1.02] ${NOTES[h % NOTES.length]} ${TILTS[(h >> 3) % TILTS.length]} ${p.hidden ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/60 text-2xl" aria-hidden="true">
                        {p.emoji}
                      </span>
                      <span className="min-w-0 text-sm font-bold leading-tight">{p.alias}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm">{p.body}</p>

                    <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="React to this note">
                      {REACTIONS.map((emoji) => {
                        const count = p.reactions[emoji] ?? 0
                        const mine = p.mine === emoji
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => react(p, mine ? null : emoji)}
                            aria-pressed={mine}
                            aria-label={`${emoji} ${count}`}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition active:scale-95 ${
                              mine ? 'border-black/60 bg-white font-semibold' : 'border-black/15 bg-white/50 hover:bg-white/80'
                            }`}
                          >
                            <span>{emoji}</span>
                            {count > 0 && <span className="text-xs tabular-nums">{count}</span>}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-700">
                      <span>
                        {fmt.format(new Date(p.createdAt))} {p.hidden && <Badge tone="amber">Hidden</Badge>}
                      </span>
                      {isHr && (
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const fresh = await api.put<Post>(`/hr/freedom-wall/${p.id}`, { hidden: !p.hidden })
                              setPosts((prev) => prev?.map((x) => (x.id === p.id ? { ...x, hidden: fresh.hidden } : x)) ?? prev)
                            }}
                            className="rounded-md border border-black/40 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 shadow-sm hover:bg-gray-100"
                          >
                            {p.hidden ? 'Unhide' : 'Hide'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm('Delete this post?')) return
                              await api.delete(`/hr/freedom-wall/${p.id}`)
                              setPosts((prev) => prev?.filter((x) => x.id !== p.id) ?? prev)
                            }}
                            className="rounded-md border border-red-700 bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {posts && hasMore && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={showOlder}
              disabled={loadingMore}
              className="rounded-lg border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-gray-100 hover:bg-white/20 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Show older notes'}
            </button>
          </div>
        )}
        {posts && !hasMore && posts.length > PAGE_SIZE && (
          <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">That's every note on the wall.</p>
        )}
      </div>
    </div>
  )
}

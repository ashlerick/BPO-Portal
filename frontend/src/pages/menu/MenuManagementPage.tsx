import { useEffect, useState } from 'react'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { ROLE_LABELS, type Role } from '../../auth/types'
import { Icon } from '../../layouts/icons'
import {
  ALL_ROLES,
  MENU_CHANGED,
  PINNED_PATH,
  buildDraft,
  draftToConfig,
  type DraftGroup,
  type DraftItem,
  type MenuConfig,
} from '../../layouts/nav'

// Admin-only editor for the sidebar: rename, reorder, hide, choose who sees
// each page, and move pages between groups. Changes are stored on the
// server and apply to everyone. This only changes what is *shown* —
// each page's access rules are unchanged, so exposing a page to a role
// that can't open it just shows them an "insufficient permissions" page.

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function ArrowButton({ direction, disabled, onClick, label }: { direction: 'up' | 'down'; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-black/10 text-gray-600 transition hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent dark:border-white/15 dark:text-gray-300 dark:hover:bg-white/10"
    >
      <Icon name="chevron" className={`h-3.5 w-3.5 ${direction === 'up' ? '-rotate-90' : 'rotate-90'}`} />
    </button>
  )
}

function ItemRow({
  item,
  index,
  count,
  groups,
  groupKey,
  onChange,
  onMove,
  onMoveToGroup,
}: {
  item: DraftItem
  index: number
  count: number
  groups: DraftGroup[]
  groupKey: string
  onChange: (patch: Partial<DraftItem>) => void
  onMove: (delta: number) => void
  onMoveToGroup: (key: string) => void
}) {
  const pinned = item.to === PINNED_PATH

  function toggleRole(role: Role) {
    onChange({ roles: item.roles.includes(role) ? item.roles.filter((r) => r !== role) : [...item.roles, role] })
  }

  return (
    <li className={`rounded-lg border border-black/5 p-3 dark:border-white/10 ${item.hidden ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <ArrowButton direction="up" disabled={index === 0} onClick={() => onMove(-1)} label={`Move ${item.label} up`} />
          <ArrowButton direction="down" disabled={index === count - 1} onClick={() => onMove(1)} label={`Move ${item.label} down`} />
        </div>
        <Icon name={item.icon} className="h-[18px] w-[18px] text-gray-500 dark:text-gray-400" />
        <input
          value={item.label}
          onChange={(e) => onChange({ label: e.target.value })}
          onBlur={() => !item.label.trim() && onChange({ label: item.defaultLabel })}
          aria-label={`Label for ${item.defaultLabel}`}
          maxLength={40}
          className="field min-w-0 flex-1 basis-40 !py-1.5"
        />
        <select
          value={groupKey}
          onChange={(e) => onMoveToGroup(e.target.value)}
          aria-label={`Group for ${item.label}`}
          className="field w-auto !py-1.5"
        >
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={!item.hidden} disabled={pinned} onChange={(e) => onChange({ hidden: !e.target.checked })} />
          Shown
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-sm text-gray-600 dark:text-gray-400">
        <span className="text-xs uppercase tracking-wide text-gray-500">Visible to</span>
        {pinned ? (
          <span>Admins (always)</span>
        ) : (
          ALL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1.5">
              <input type="checkbox" checked={item.roles.includes(role)} onChange={() => toggleRole(role)} />
              {ROLE_LABELS[role]}
            </label>
          ))
        )}
        {item.label !== item.defaultLabel && (
          <button type="button" onClick={() => onChange({ label: item.defaultLabel })} className="text-xs text-brand-700 underline dark:text-brand-400">
            Reset name
          </button>
        )}
      </div>
    </li>
  )
}

export function MenuManagementPage() {
  const [draft, setDraft] = useState<DraftGroup[] | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<MenuConfig | null>('/menu')
      .then((config) => {
        const d = buildDraft(config)
        setDraft(d)
        setSaved(JSON.stringify(draftToConfig(d)))
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [])

  if (error) return <ErrorState message={error} />
  if (!draft) return <LoadingState />

  const dirty = JSON.stringify(draftToConfig(draft)) !== saved

  function updateGroup(gi: number, patch: Partial<DraftGroup>) {
    setDraft((prev) => prev?.map((g, i) => (i === gi ? { ...g, ...patch } : g)) ?? null)
  }

  function updateItem(gi: number, ii: number, patch: Partial<DraftItem>) {
    setDraft((prev) => prev?.map((g, i) => (i === gi ? { ...g, items: g.items.map((item, j) => (j === ii ? { ...item, ...patch } : item)) } : g)) ?? null)
  }

  function moveItemToGroup(gi: number, ii: number, key: string) {
    setDraft((prev) => {
      if (!prev) return prev
      const item = prev[gi].items[ii]
      return prev.map((g, i) => {
        if (i === gi) return { ...g, items: g.items.filter((_, j) => j !== ii) }
        return g.key === key ? { ...g, items: [...g.items, item] } : g
      })
    })
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    setMessage(null)
    try {
      const config = draftToConfig(draft)
      await api.put('/menu', config)
      setSaved(JSON.stringify(config))
      setMessage('Saved. Everyone will see the new menu.')
      window.dispatchEvent(new Event(MENU_CHANGED))
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not save the menu')
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    if (!window.confirm('Reset the menu to the built-in layout for everyone?')) return
    setBusy(true)
    setMessage(null)
    try {
      await api.delete('/menu')
      const d = buildDraft(null)
      setDraft(d)
      setSaved(JSON.stringify(draftToConfig(d)))
      setMessage('Menu reset to the built-in layout.')
      window.dispatchEvent(new Event(MENU_CHANGED))
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not reset the menu')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Menu Management"
        description="Rename, reorder and hide sidebar pages, and choose which roles see each one. This changes what people see, not what they're allowed to open."
      />

      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-b border-black/5 bg-white/80 px-4 py-3 backdrop-blur md:-mx-8 md:px-8 dark:border-white/10 dark:bg-brand-950/80">
        <Button variant="primary" size="sm" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : 'Save menu'}
        </Button>
        <Button size="sm" disabled={busy} onClick={reset}>
          Reset to default
        </Button>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {message ?? (dirty ? 'You have unsaved changes.' : 'No unsaved changes.')}
        </span>
      </div>

      <div className="space-y-5">
        {draft.map((group, gi) => (
          <Card key={group.key} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                <ArrowButton direction="up" disabled={gi === 0} onClick={() => setDraft((prev) => (prev ? move(prev, gi, gi - 1) : prev))} label={`Move ${group.label} up`} />
                <ArrowButton direction="down" disabled={gi === draft.length - 1} onClick={() => setDraft((prev) => (prev ? move(prev, gi, gi + 1) : prev))} label={`Move ${group.label} down`} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Group</span>
              <input
                value={group.label}
                onChange={(e) => updateGroup(gi, { label: e.target.value })}
                onBlur={() => !group.label.trim() && updateGroup(gi, { label: group.defaultLabel })}
                aria-label={`Name for the ${group.defaultLabel} group`}
                maxLength={40}
                className="field max-w-xs !py-1.5"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {group.items.length} page{group.items.length === 1 ? '' : 's'}
              </span>
            </div>

            {group.items.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Empty. It won't show in the sidebar until a page is moved here.</p>
            ) : (
              <ul className="space-y-2">
                {group.items.map((item, ii) => (
                  <ItemRow
                    key={item.to}
                    item={item}
                    index={ii}
                    count={group.items.length}
                    groups={draft}
                    groupKey={group.key}
                    onChange={(patch) => updateItem(gi, ii, patch)}
                    onMove={(delta) => updateGroup(gi, { items: move(group.items, ii, ii + delta) })}
                    onMoveToGroup={(key) => moveItemToGroup(gi, ii, key)}
                  />
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

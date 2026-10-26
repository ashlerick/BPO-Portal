import { useEffect, useRef, useState } from 'react'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { errorMessage, Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../services/api'
import { downloadPng, drawPlan } from './exportImage'
import { clashKey, counts, DEFAULT_PLAN, EMPTY_EXTRA, EMPTY_SEAT, MAX_EXTRAS, MAX_SIDE, portClashes, portText, rowLetter, seatAt, seatKey, seatLabel, type Extra, type Plan, type Seat } from './plan'

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(1, Math.min(MAX_SIDE, v)))
  return (
    <div className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
      {label}
      <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 dark:border-white/15">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => set(value - 1)} className="h-11 w-11 text-xl hover:bg-black/5 dark:hover:bg-white/10">
          −
        </button>
        <span className="min-w-9 text-center font-bold text-gray-900 dark:text-gray-100">{value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => set(value + 1)} className="h-11 w-11 text-xl hover:bg-black/5 dark:hover:bg-white/10">
          +
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={`min-w-0 flex-1 basis-32 rounded-xl border px-4 py-3 ${warn && value > 0 ? 'border-amber-400/60 bg-amber-50/70 dark:bg-amber-500/10' : 'border-black/5 bg-white/80 dark:border-white/10 dark:bg-white/[0.035]'}`}
    >
      <div className={`text-xs uppercase tracking-wide ${warn && value > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`}>{label}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  )
}

function ExportDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [showPorts, setShowPorts] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) drawPlan(canvasRef.current, plan, showPorts)
  }, [plan, showPorts])

  const fileName = `${(plan.title || 'seating-plan').trim().replace(/[^A-Za-z0-9._-]+/g, '-')}.png`

  return (
    <Modal label="Export seating plan" onClose={onClose} className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Export as image</h2>
        <Button onClick={onClose} aria-label="Close">
          ×
        </Button>
      </div>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showPorts} onChange={(e) => setShowPorts(e.target.checked)} className="h-4 w-4" />
        Show switch ports (leave off for a copy you will post on a wall)
      </label>
      <div className="overflow-auto rounded-lg border border-black/10 dark:border-white/10">
        <canvas ref={canvasRef} className="block h-auto min-w-[40rem] max-w-none" style={{ width: '100%' }} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          onClick={() => {
            if (canvasRef.current) downloadPng(canvasRef.current, fileName)
          }}
        >
          Download PNG
        </Button>
      </div>
    </Modal>
  )
}

export function SeatingPage() {
  const toast = useToast()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [picked, setPicked] = useState('0-0')
  // What is on the server; Cancel goes back to it.
  const [savedPlan, setSavedPlan] = useState<Plan | null>(null)
  // The page opens as a preview. Nothing can be typed until Edit is pressed.
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api
      .get<Plan | null>('/hr/seating')
      // A plan saved before "Other ports" existed has no extras.
      .then((saved) => {
        const loaded = saved ? { ...saved, extras: saved.extras ?? [] } : DEFAULT_PLAN
        setPlan(loaded)
        setSavedPlan(loaded)
      })
      .catch((err) => setLoadError(errorMessage(err, 'Could not load the seating plan')))
  }, [])

  // A plan with unsaved changes should not vanish on a stray tab close or refresh.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (loadError) return <ErrorState message={loadError} />
  if (!plan) return <LoadingState label="Loading the seating plan…" />

  const change = (next: Plan) => {
    setPlan(next)
    setDirty(true)
  }

  // A seat that fell outside a smaller grid is no longer selectable.
  const [pr, pc] = picked.split('-').map(Number)
  const key = pr < plan.rows && pc < plan.cols ? picked : seatKey(0, 0)
  const [sr, sc] = key.split('-').map(Number)
  const seat = seatAt(plan, sr, sc)
  const stats = counts(plan)
  const clashes = portClashes(plan)
  const clashing = new Set(clashes.map((c) => clashKey(c.sw, c.port)))

  const editExtra = (index: number, field: keyof Extra, value: string) =>
    change({ ...plan, extras: plan.extras.map((e, i) => (i === index ? { ...e, [field]: value } : e)) })

  const edit = (field: keyof Seat) => (value: string) => change({ ...plan, seats: { ...plan.seats, [key]: { ...seat, [field]: value } } })

  function cancel() {
    if (dirty && !window.confirm('Discard your changes to the seating plan?')) return
    if (savedPlan) setPlan(savedPlan)
    setDirty(false)
    setEditing(false)
  }

  async function save() {
    if (!plan) return
    setSaving(true)
    try {
      await api.put('/hr/seating', { title: plan.title, rows: plan.rows, cols: plan.cols, seats: plan.seats, extras: plan.extras })
      setSavedPlan(plan)
      setDirty(false)
      setEditing(false)
      toast.success('Seating plan saved')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the seating plan'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Seating"
        description="Who sits where, and which switch port each seat uses."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="text-sm text-amber-600 dark:text-amber-300">Unsaved changes</span>}
            {editing ? (
              <>
                <Button onClick={cancel} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={save} disabled={saving || !dirty}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => setExporting(true)}>Export image</Button>
                <Button variant="primary" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </>
            )}
          </div>
        }
      />

      {editing ? (
      <Card className="mb-4 flex flex-wrap items-end gap-4">
        <Field label="Plan title" className="min-w-52 flex-1">
          <input value={plan.title} maxLength={80} onChange={(e) => change({ ...plan, title: e.target.value })} className="field" />
        </Field>
        <Stepper label="Rows" value={plan.rows} onChange={(rows) => change({ ...plan, rows })} />
        <Stepper label="Seats per row" value={plan.cols} onChange={(cols) => change({ ...plan, cols })} />
      </Card>
      ) : (
        <h2 className="mb-3 text-lg font-semibold">{plan.title}</h2>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <Stat label="Seats" value={stats.total} />
        <Stat label="Filled" value={stats.filled} />
        <Stat label="Open" value={stats.open} />
        <Stat label="No port logged" value={stats.noPort} warn />
      </div>

      {clashes.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/70 dark:text-red-300">
          <div className="font-semibold">Same port used twice</div>
          <ul className="mt-1 list-disc pl-5">
            {clashes.map((c) => (
              <li key={clashKey(c.sw, c.port)}>
                {c.sw ? `${c.sw} port ${c.port}` : `Port ${c.port}`}: {c.users.join(' and ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <Card className="overflow-x-auto">
            <div className="flex w-max flex-col gap-3">
              {Array.from({ length: plan.rows }, (_, r) => (
                <div key={r} className="flex items-center gap-2">
                  <div className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Row {rowLetter(r)}</div>
                  {Array.from({ length: plan.cols }, (_, c) => {
                    const s = seatAt(plan, r, c)
                    const name = s.name.trim()
                    const selected = seatKey(r, c) === key
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPicked(seatKey(r, c))}
                        aria-pressed={selected}
                        aria-label={`Seat ${seatLabel(r, c)}, ${name || 'open'}, ${s.port.trim() ? `port ${s.port.trim()}` : 'no port logged'}`}
                        className={`flex h-16 w-[108px] shrink-0 flex-col items-start justify-between rounded-lg border px-2.5 py-2 text-left ${
                          name
                            ? 'border-emerald-500/50 bg-emerald-100/70 dark:bg-emerald-500/15'
                            : 'border-dashed border-gray-400 bg-transparent dark:border-white/30'
                        } ${selected ? 'outline outline-2 outline-offset-2 outline-emerald-500' : ''}`}
                      >
                        <span className="flex w-full items-center justify-between">
                          <span className="text-[13px] font-bold">{seatLabel(r, c)}</span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                              !s.port.trim()
                                ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300'
                                : clashing.has(clashKey(s.sw, s.port))
                                  ? 'bg-red-200 text-red-900 dark:bg-red-500/25 dark:text-red-200'
                                  : 'bg-black/10 dark:bg-white/10'
                            }`}
                          >
                            {portText(s)}
                          </span>
                        </span>
                        <span className={`w-full truncate text-[13px] ${name ? 'font-semibold' : 'italic text-gray-500 dark:text-gray-400'}`}>{name || 'Open'}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </Card>
          {editing && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Making the grid smaller never deletes what you typed: the names come back when you make it bigger again.
            </p>
          )}

          {!editing && (
            <Card className="mt-4">
              <h2 className="mb-3 text-sm font-semibold">Other ports</h2>
              {plan.extras.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">None yet. Press Edit to add ports that are not a cube, like the boss&apos;s office or the balancer.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {plan.extras.map((e, i) => (
                  <div key={i} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{e.label.trim() || `Other ${i + 1}`}</span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                          !e.port.trim()
                            ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300'
                            : clashing.has(clashKey(e.sw, e.port))
                              ? 'bg-red-200 text-red-900 dark:bg-red-500/25 dark:text-red-200'
                              : 'bg-black/10 dark:bg-white/10'
                        }`}
                      >
                        {portText(e)}
                      </span>
                    </div>
                    {(e.sw.trim() || e.note.trim()) && (
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{[e.sw.trim(), e.note.trim()].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {editing && (
          <Card className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Other ports</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ports that are not a cube: the boss&apos;s office, the balancer.</p>
              </div>
              <Button
                size="sm"
                disabled={plan.extras.length >= MAX_EXTRAS}
                onClick={() => change({ ...plan, extras: [...plan.extras, EMPTY_EXTRA] })}
              >
                + Add
              </Button>
            </div>
            {plan.extras.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">None yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {plan.extras.map((e, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <input
                        value={e.label}
                        maxLength={60}
                        placeholder="What is it? (Balancer)"
                        aria-label="Name of this port"
                        onChange={(ev) => editExtra(i, 'label', ev.target.value)}
                        className="field min-w-0 flex-1"
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Remove ${e.label.trim() || `other port ${i + 1}`}`}
                        onClick={() => change({ ...plan, extras: plan.extras.filter((_, j) => j !== i) })}
                      >
                        ×
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={e.sw}
                        maxLength={40}
                        placeholder="Switch"
                        aria-label="Switch"
                        onChange={(ev) => editExtra(i, 'sw', ev.target.value)}
                        className="field min-w-0 flex-1"
                      />
                      <input
                        value={e.port}
                        maxLength={20}
                        placeholder="Port"
                        aria-label="Port"
                        onChange={(ev) => editExtra(i, 'port', ev.target.value)}
                        className={`field w-24 shrink-0 ${e.port.trim() && clashing.has(clashKey(e.sw, e.port)) ? '!border-red-500' : ''}`}
                      />
                    </div>
                    <input
                      value={e.note}
                      maxLength={200}
                      placeholder="Note"
                      aria-label="Note"
                      onChange={(ev) => editExtra(i, 'note', ev.target.value)}
                      className="field"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
          )}
        </div>

        {editing ? (
        <Card className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Seat</div>
            <div className="text-2xl font-bold">{seatLabel(sr, sc)}</div>
          </div>
          <Field label="Name">
            <input value={seat.name} maxLength={60} placeholder="Leave empty if open" onChange={(e) => edit('name')(e.target.value)} className="field" />
          </Field>
          <div className="flex gap-3">
            <Field label="Switch" className="flex-1">
              <input value={seat.sw} maxLength={40} placeholder="SW-2F-01" onChange={(e) => edit('sw')(e.target.value)} className="field" />
            </Field>
            <Field label="Port" className="flex-1">
              <input value={seat.port} maxLength={20} placeholder="12" onChange={(e) => edit('port')(e.target.value)} className="field" />
            </Field>
          </div>
          <Field label="Wall jack">
            <input value={seat.jack} maxLength={40} placeholder="WJ-A3" onChange={(e) => edit('jack')(e.target.value)} className="field" />
          </Field>
          <Field label="Notes">
            <input value={seat.note} maxLength={200} placeholder="Anything IT should know" onChange={(e) => edit('note')(e.target.value)} className="field" />
          </Field>
          <Button variant="danger" onClick={() => change({ ...plan, seats: { ...plan.seats, [key]: { ...EMPTY_SEAT, sw: seat.sw } } })}>
            Clear this seat
          </Button>
        </Card>
        ) : (
          <Card className="w-full shrink-0 lg:w-80">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Seat</div>
            <div className="mb-3 text-2xl font-bold">{seatLabel(sr, sc)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="font-semibold">{seat.name.trim() || 'Open'}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Switch</dt>
              <dd className="font-semibold">{seat.sw.trim() || '—'}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Port</dt>
              <dd className="font-semibold">{seat.port.trim() || 'Not logged'}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Wall jack</dt>
              <dd className="font-semibold">{seat.jack.trim() || '—'}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Notes</dt>
              <dd>{seat.note.trim() || '—'}</dd>
            </dl>
          </Card>
        )}
      </div>

      {exporting && <ExportDialog plan={plan} onClose={() => setExporting(false)} />}
    </div>
  )
}

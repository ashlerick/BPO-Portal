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
import { counts, DEFAULT_PLAN, EMPTY_SEAT, MAX_SIDE, portText, rowLetter, seatAt, seatKey, seatLabel, type Plan, type Seat } from './plan'

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
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api
      .get<Plan | null>('/hr/seating')
      .then((saved) => setPlan(saved ?? DEFAULT_PLAN))
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

  const edit = (field: keyof Seat) => (value: string) => change({ ...plan, seats: { ...plan.seats, [key]: { ...seat, [field]: value } } })

  async function save() {
    if (!plan) return
    setSaving(true)
    try {
      await api.put('/hr/seating', { title: plan.title, rows: plan.rows, cols: plan.cols, seats: plan.seats })
      setDirty(false)
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
            <Button onClick={() => setExporting(true)}>Export image</Button>
            <Button variant="primary" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
      />

      <Card className="mb-4 flex flex-wrap items-end gap-4">
        <Field label="Plan title" className="min-w-52 flex-1">
          <input value={plan.title} maxLength={80} onChange={(e) => change({ ...plan, title: e.target.value })} className="field" />
        </Field>
        <Stepper label="Rows" value={plan.rows} onChange={(rows) => change({ ...plan, rows })} />
        <Stepper label="Seats per row" value={plan.cols} onChange={(cols) => change({ ...plan, cols })} />
      </Card>

      <div className="mb-4 flex flex-wrap gap-3">
        <Stat label="Seats" value={stats.total} />
        <Stat label="Filled" value={stats.filled} />
        <Stat label="Open" value={stats.open} />
        <Stat label="No port logged" value={stats.noPort} warn />
      </div>

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
                              s.port.trim() ? 'bg-black/10 dark:bg-white/10' : 'bg-amber-200/80 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300'
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
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Making the grid smaller never deletes what you typed: the names come back when you make it bigger again.
          </p>
        </div>

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
      </div>

      {exporting && <ExportDialog plan={plan} onClose={() => setExporting(false)} />}
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { Badge } from '../../components/ui/Badge'
import { formatDateOnly } from '../../utils/dates'
import type { Dependent, Enrollment } from '../hr/types'
import type { Benefit } from './types'

function groupByCategory(benefits: Benefit[]): Map<string, Benefit[]> {
  const groups = new Map<string, Benefit[]>()
  for (const benefit of benefits) {
    const group = groups.get(benefit.category) ?? []
    group.push(benefit)
    groups.set(benefit.category, group)
  }
  return groups
}

function CreateForm({ onCreated }: { onCreated: (b: Benefit) => void }) {
  const { guardedAction } = useAuth()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    guardedAction(['hr', 'admin'], async () => {
      setError(null)
      setSubmitting(true)
      try {
        const created = await api.post<Benefit>('/benefits', {
          title,
          category,
          description,
          eligibility: eligibility || null,
        })
        onCreated(created)
        setTitle('')
        setCategory('')
        setDescription('')
        setEligibility('')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create benefit')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="ben-title" className="text-sm text-gray-600 dark:text-gray-400">
            Title
          </label>
          <input id="ben-title" required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </div>
        <div className="space-y-1">
          <label htmlFor="ben-category" className="text-sm text-gray-600 dark:text-gray-400">
            Category
          </label>
          <input
            id="ben-category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="field"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="ben-description" className="text-sm text-gray-600 dark:text-gray-400">
          Description
        </label>
        <textarea
          id="ben-description"
          required
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="field"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="ben-eligibility" className="text-sm text-gray-600 dark:text-gray-400">
          Eligibility (optional)
        </label>
        <input
          id="ben-eligibility"
          value={eligibility}
          onChange={(e) => setEligibility(e.target.value)}
          className="field"
        />
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add benefit'}
      </Button>
    </CardForm>
  )
}

function BenefitCard({
  benefit,
  canManage,
  onUpdated,
  onDeleted,
}: {
  benefit: Benefit
  canManage: boolean
  onUpdated: (b: Benefit) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(benefit.title)
  const [category, setCategory] = useState(benefit.category)
  const [description, setDescription] = useState(benefit.description)
  const [eligibility, setEligibility] = useState(benefit.eligibility ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { guardedAction } = useAuth()

  function save() {
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        const updated = await api.put<Benefit>(`/benefits/${benefit.id}`, {
          title,
          category,
          description,
          eligibility: eligibility || null,
        })
        onUpdated(updated)
        setEditing(false)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not save')
      } finally {
        setSaving(false)
      }
    })
  }

  function remove() {
    guardedAction(['hr', 'admin'], async () => {
      setDeleting(true)
      setError(null)
      try {
        await api.delete(`/benefits/${benefit.id}`)
        onDeleted(benefit.id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not delete')
        setDeleting(false)
      }
    })
  }

  if (editing) {
    return (
      <Card>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field font-medium" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="field" />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="field mt-2"
        />
        <input
          value={eligibility}
          onChange={(e) => setEligibility(e.target.value)}
          placeholder="Eligibility (optional)"
          className="field mt-2"
        />
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="font-medium text-gray-900 dark:text-gray-100">{benefit.title}</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{benefit.description}</p>
      {benefit.eligibility && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Eligibility: {benefit.eligibility}</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {canManage && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={remove} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      )}
    </Card>
  )
}

function MyBenefits() {
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null)
  const [dependents, setDependents] = useState<Dependent[] | null>(null)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<Enrollment[]>('/hr/enrollments').then(setEnrollments).catch(() => setEnrollments([]))
    api.get<Dependent[]>('/hr/employee-records?kind=dependents').then(setDependents).catch(() => setDependents([]))
  }, [])

  async function addDependent(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const created = await api.post<Dependent>('/hr/employee-records?kind=dependents', { name, relationship })
      setDependents((prev) => [...(prev ?? []), created])
      setName('')
      setRelationship('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the dependent')
    }
  }

  const tone = { pending: 'amber', enrolled: 'green', waived: 'gray', terminated: 'red' } as const

  return (
    <SectionStack>
      <Section id="benefits.mine" title="My enrollment status" hint="Your HMO and benefit enrollments" defaultOpen>
        {!enrollments ? (
          <LoadingState />
        ) : enrollments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You have no benefit enrollments on record yet. HR enrolls you; ask through HR Requests if something looks wrong.
          </p>
        ) : (
          <ul className="space-y-2">
            {enrollments.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-gray-900 dark:text-gray-100">
                  {e.benefitTitle}
                  {e.effectiveDate && <span className="text-gray-500 dark:text-gray-400"> · effective {formatDateOnly(e.effectiveDate)}</span>}
                  {e.provider && <span className="text-gray-500 dark:text-gray-400"> · {e.provider}</span>}
                </span>
                <Badge tone={tone[e.status]}>{e.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="benefits.dependents" title="Dependents" hint="People covered under your benefits">
        <div className="space-y-3">
          {dependents && dependents.length > 0 && (
            <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
              {dependents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-gray-900 dark:text-gray-100">
                    {d.name} <span className="text-gray-500 dark:text-gray-400">· {d.relationship}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await api.delete(`/hr/employee-records?kind=dependents&sub=${d.id}`)
                      setDependents((prev) => prev?.filter((x) => x.id !== d.id) ?? null)
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addDependent} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
              Name
              <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
              Relationship
              <input required value={relationship} onChange={(e) => setRelationship(e.target.value)} className="field" />
            </label>
            <Button type="submit" size="sm">
              Add dependent
            </Button>
          </form>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </Section>
    </SectionStack>
  )
}

export function BenefitsPage() {
  const { effectiveRoles } = useAuth()
  const canManage = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [data, setData] = useState<Benefit[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Benefit[]>('/benefits')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Benefits" />

      {canManage && (
        <div className="mb-4">
          <CreateForm onCreated={(b) => setData((prev) => (prev ? [...prev, b] : [b]))} />
        </div>
      )}

      <div className="mb-3">
        <MyBenefits />
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {data && data.length === 0 && <EmptyState label="No benefits published yet." />}

      {data && data.length > 0 && (
        <SectionStack>
          {Array.from(groupByCategory(data)).map(([category, benefits]) => (
            <Section
              key={category}
              id={`benefits.${category.toLowerCase().replace(/\s+/g, '-')}`}
              title={category}
              hint={`${benefits.length} ${benefits.length === 1 ? 'item' : 'items'}`}
              defaultOpen
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {benefits.map((benefit) => (
                  <BenefitCard
                    key={benefit.id}
                    benefit={benefit}
                    canManage={canManage}
                    onUpdated={(updated) =>
                      setData((prev) => prev?.map((b) => (b.id === updated.id ? updated : b)) ?? null)
                    }
                    onDeleted={(id) => setData((prev) => prev?.filter((b) => b.id !== id) ?? null)}
                  />
                ))}
              </div>
            </Section>
          ))}
        </SectionStack>
      )}
    </div>
  )
}

// Possible duplicate applicants. Two applicants look like the same person when they share an email or a phone number, or have a very
// similar name (any order, small typos). The same birth date and the same resume file name only add to a match, never make one alone.
// This only ever flags: nothing is merged or hidden, and HR can say "not the same person" (kept in applicant_not_same).

export interface MatchCandidate {
  id: string
  name: string
  email: string | null
  phone: string | null
  birthDate: Date | null
  resumeName: string | null
}

export type MatchReason = 'email' | 'phone' | 'name' | 'birthday' | 'resume'

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const nameTokens = (name: string) =>
  strip(name)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2) // a bare initial says nothing

const normEmail = (e: string | null) => (e ? e.trim().toLowerCase() : '')
// Digits only, and the last ten, so "0917 123 4567", "+63 917 123 4567" and "9171234567" are the same number.
const normPhone = (p: string | null) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 7 ? d.slice(-10) : ''
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}
const tolerance = (len: number) => (len >= 7 ? 2 : len >= 4 ? 1 : 0)

/** Every word of the shorter name has a counterpart in the other (small typos allowed), and there are at least two words. */
function namesAlike(a: string[], b: string[]): boolean {
  const [small, big] = a.length <= b.length ? [a, b] : [b, a]
  if (small.length < 2) return false // one common word ("Maria") is not enough to call two people the same
  const used = new Set<number>()
  for (const t of small) {
    const at = big.findIndex((u, i) => !used.has(i) && distance(t, u) <= Math.min(tolerance(t.length), tolerance(u.length)))
    if (at < 0) return false
    used.add(at)
  }
  return true
}

interface Prepared {
  c: MatchCandidate
  email: string
  phone: string
  tokens: string[]
  birth: string
  resume: string
}
const prepare = (c: MatchCandidate): Prepared => ({
  c,
  email: normEmail(c.email),
  phone: normPhone(c.phone),
  tokens: nameTokens(c.name),
  birth: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : '',
  resume: c.resumeName ? strip(c.resumeName).trim() : '',
})

/** For each subject id, the other applicants that look like the same person, with why. `skip` holds pairs HR said are different. */
export function findMatches(all: MatchCandidate[], subjectIds: string[], skip: Set<string>): Map<string, { id: string; why: MatchReason[] }[]> {
  const prepared = all.map(prepare)
  const wanted = new Set(subjectIds)
  const out = new Map<string, { id: string; why: MatchReason[] }[]>()
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  for (const a of prepared) {
    if (!wanted.has(a.c.id)) continue
    const found: { id: string; why: MatchReason[] }[] = []
    for (const b of prepared) {
      if (a.c.id === b.c.id || skip.has(pairKey(a.c.id, b.c.id))) continue
      const why: MatchReason[] = []
      if (a.email && a.email === b.email) why.push('email')
      if (a.phone && a.phone === b.phone) why.push('phone')
      const alike = namesAlike(a.tokens, b.tokens)
      if (alike) why.push('name')
      if (why.length === 0) continue // email, phone or name has to start it
      if (a.birth && a.birth === b.birth) why.push('birthday')
      if (a.resume && a.resume === b.resume) why.push('resume')
      found.push({ id: b.c.id, why })
    }
    // the strongest first: shared email or phone, then more reasons
    found.sort((x, y) => Number(y.why.includes('email') || y.why.includes('phone')) - Number(x.why.includes('email') || x.why.includes('phone')) || y.why.length - x.why.length)
    out.set(a.c.id, found)
  }
  return out
}

export const pairOf = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a])

// Run with: node --test src/pages/reports/foaWeeks.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import type { FoaReportData } from './foa.ts'
import { addDays, foaWeekEnding, foaWeeksOfYear, isoWeekOf, lastFriday, startFromPrevious, totalsOf } from './foaWeeks.ts'

test('ISO week numbers', () => {
  assert.deepEqual(isoWeekOf('2026-11-09'), { year: 2026, num: 46 })
  assert.deepEqual(isoWeekOf('2026-11-13'), { year: 2026, num: 46 })
  assert.deepEqual(isoWeekOf('2026-01-01'), { year: 2026, num: 1 })
  assert.deepEqual(isoWeekOf('2025-12-29'), { year: 2026, num: 1 })
  assert.deepEqual(isoWeekOf('2027-01-01'), { year: 2026, num: 53 })
})

test('a week is named after the Friday it ends on and starts a Friday earlier', () => {
  assert.deepEqual(foaWeekEnding('2026-09-18'), { num: 38, year: 2026, start: '2026-09-11', end: '2026-09-18' })
  assert.deepEqual(foaWeekEnding('2026-11-13T00:00:00.000Z'), { num: 46, year: 2026, start: '2026-11-06', end: '2026-11-13' })
})

test('a year lists its weeks in order, each ending on a Friday', () => {
  const w = foaWeeksOfYear(2026)
  assert.equal(w.length, 53)
  assert.equal(w[0].end, '2026-01-02')
  assert.equal(w[0].start, '2025-12-26')
  assert.equal(w.find((x) => x.num === 46)?.end, '2026-11-13')
  assert.ok(w.every((x) => new Date(`${x.end}T00:00:00Z`).getUTCDay() === 5))
  assert.equal(foaWeeksOfYear(2025).length, 52)
})

test('the last Friday is today on a Friday, else the one before', () => {
  assert.equal(lastFriday('2026-11-13'), '2026-11-13')
  assert.equal(lastFriday('2026-11-11'), '2026-11-06')
  assert.equal(lastFriday('2026-11-14'), '2026-11-13')
  assert.equal(lastFriday('2026-11-15'), '2026-11-13')
})

test('dates add across month and year ends', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
})

test('same as last week moves each day of the sheet to the new week and leaves the counts and text behind', () => {
  const previous = {
    territories: ['CONCORD'],
    attendance: { '2026-11-06': { Routeboard: ['CONCORD'] }, '2026-11-09': { STOP: ['WA & WA Porter', 'D2D'] } },
    taskChecklist: { 'WEX Report': { Tuesday: true } },
    varianceInvestigations: { extendedBreaks: 3 },
    highlights: 'text',
  }
  const next = startFromPrevious(previous, '2026-11-06', '2026-11-13')
  assert.deepEqual(next.attendance, { '2026-11-13': { Routeboard: ['CONCORD'] }, '2026-11-16': { STOP: ['WA & WA Porter', 'D2D'] } })
  assert.deepEqual(next.territories, ['CONCORD'])
  assert.deepEqual(next.taskChecklist, { 'WEX Report': { Tuesday: true } })
  assert.equal(next.varianceInvestigations, undefined)
  assert.equal(next.highlights, undefined)
  next.territories!.push('X')
  assert.deepEqual(previous.territories, ['CONCORD']) // a copy, not the same list
  assert.deepEqual(startFromPrevious(undefined, '2026-11-06', '2026-11-13'), {})
})

test('totals count the numbers, the ticks and the filled cells', () => {
  const data = {
    varianceInvestigations: { extendedBreaks: 2, otherInvestigations: 1 },
    motiveSafetyEvents: { cellphone: 1, speeding: 3 },
    taskChecklist: { A: { Monday: true, Tuesday: true, Wednesday: false }, B: { Monday: true } },
    attendance: { '2026-11-06': { Routeboard: ['CONCORD'], TOP: [] }, '2026-11-07': { Routeboard: ['N/A'] } },
  }
  const t = totalsOf(data as unknown as FoaReportData, ['Routeboard', 'TOP'], ['A', 'B'], ['Monday', 'Tuesday', 'Wednesday'], 8)
  assert.deepEqual(t, { variance: 3, safety: 4, checklistDone: 3, checklistTotal: 6, attendanceFilled: 2, attendanceTotal: 16 })
  assert.equal(totalsOf(undefined, ['Routeboard'], ['A'], ['Monday'], 8).variance, 0)
})

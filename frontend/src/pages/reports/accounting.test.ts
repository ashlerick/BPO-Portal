// Run with: node --test src/pages/reports/accounting.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { countOf, draftHighlights, parseEntries, realNames, totalOf } from './accounting.ts'

// The lines come from the Accounting weekly summary report for 10.30.2026.
test('parseEntries reads "name - $amount" lines', () => {
  const rows = parseEntries(
    [
      'Lockbox - $163,706.13',
      'Los Angeles Dodgers LLC - $25,598.00',
      'Lumen Remittance Advice for Copia Resources WA, Inc. - $25,541.80',
      '135G BKMTenantStatement  - $6,156.06',
      'SoCalGas - 10.27.26 - $33.31',
      'AT&T - $75.60',
    ].join('\n'),
  )
  assert.deepEqual(rows, [
    { name: 'Lockbox', amount: 163706.13 },
    { name: 'Los Angeles Dodgers LLC', amount: 25598 },
    { name: 'Lumen Remittance Advice for Copia Resources WA, Inc.', amount: 25541.8 },
    { name: '135G BKMTenantStatement', amount: 6156.06 },
    { name: 'SoCalGas - 10.27.26', amount: 33.31 },
    { name: 'AT&T', amount: 75.6 },
  ])
})

test('parseEntries handles numbering, tabs, bare names and negatives', () => {
  assert.deepEqual(parseEntries('1. Conservice\t$150,195.75\n2) Refund - ($40.00)\n\n• Just a name'), [
    { name: 'Conservice', amount: 150195.75 },
    { name: 'Refund', amount: -40 },
    { name: 'Just a name' },
  ])
})

test('totals match the report: AR is $462,657.28 and 14 invoices', () => {
  const ar = parseEntries(
    ['Lockbox - $163,706.13', 'Los Angeles Dodgers LLC - $25,598.00', 'Conservice - $150,195.75', 'Payment by Irvine Company - $91,030.00', 'RealPage ACH Payment Remittance Advice - $6,585.60', 'Lumen Remittance Advice for Copia Resources WA, Inc. - $25,541.80'].join('\n'),
  )
  assert.equal(Math.round(totalOf(ar) * 100) / 100, 462657.28)
  assert.equal(countOf([{ name: 'Dodgers', count: 5 }, { name: 'Rose Quarter', count: 4 }, { name: 'State Farm', count: 1 }, { name: 'Lumen', count: 4 }]), 14)
})

test('a "0" entry means none this week', () => {
  assert.deepEqual(realNames(['0', ' ', '490 Avenue of the Palms']), ['490 Avenue of the Palms'])
})

test('draftHighlights does not double a period that ends a name', () => {
  const text = draftHighlights({ receivables: [{ name: 'Conservice', amount: 1 }, { name: 'Lumen Remittance for Copia Resources WA, Inc.', amount: 2 }] })
  assert.match(text, /Inc\.\n|Inc\.$/)
  assert.doesNotMatch(text, /Inc\.\./)
})

test('draftHighlights words the entries and notes what had none', () => {
  const text = draftHighlights({
    receivables: [{ name: 'Lockbox', amount: 100 }],
    beginBilling: { CA: ['Woodchase Apartments'], WA: ['0'] },
    invoices: [{ name: 'Dodgers', count: 5 }],
    coupa: ['0'],
  })
  assert.match(text, /Accounts Receivable \(AR\) Entered – \$100\.00/)
  assert.match(text, /Begin Billing – 1/)
  assert.match(text, /CA: Woodchase Apartments/)
  assert.match(text, /Invoices Created – 5/)
  assert.match(text, /No Coupa, Ops Merchant or VendorCafe entries, change management, 30-day notices, or parent account changes this week\./)
})

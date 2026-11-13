// Run with: node --test src/pages/reports/numberMask.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { caretAfterMask, formatMoney, formatWhole, maskMoney, maskWhole, parseMasked } from './numberMask.ts'

test('money gets thousands commas as it is typed', () => {
  assert.equal(maskMoney('1230033'), '1,230,033')
  assert.equal(maskMoney('1,230,0334'), '12,300,334')
  assert.equal(maskMoney('163706.13'), '163,706.13')
  assert.equal(maskMoney('$ 25,598.00'), '25,598.00')
})

test('money keeps a trailing dot and at most two decimals', () => {
  assert.equal(maskMoney('12.'), '12.')
  assert.equal(maskMoney('12.3'), '12.3')
  assert.equal(maskMoney('12.345'), '12.34')
  assert.equal(maskMoney('1.2.3'), '1.23')
  assert.equal(maskMoney('.5'), '.5')
})

test('money drops letters and leading zeros, and allows one leading minus for a credit', () => {
  assert.equal(maskMoney('abc'), '')
  assert.equal(maskMoney('0012'), '12')
  assert.equal(maskMoney('0'), '0')
  assert.equal(maskMoney('-5000'), '-5,000')
  assert.equal(maskMoney('5-000'), '5,000')
  assert.equal(maskMoney('-'), '-')
})

test('whole numbers get commas and nothing else', () => {
  assert.equal(maskWhole('12a345'), '12,345')
  assert.equal(maskWhole('0'), '0')
  assert.equal(maskWhole(''), '')
})

test('a masked text parses back to its number, or to nothing while it is incomplete', () => {
  assert.equal(parseMasked('1,230,033.5'), 1230033.5)
  assert.equal(parseMasked('-5,000'), -5000)
  assert.equal(parseMasked('12.'), 12)
  assert.equal(parseMasked(''), undefined)
  assert.equal(parseMasked('-'), undefined)
  assert.equal(parseMasked('.'), undefined)
})

test('stored values are shown with two decimals or commas', () => {
  assert.equal(formatMoney(1230033), '1,230,033.00')
  assert.equal(formatMoney(75.6), '75.60')
  assert.equal(formatMoney(undefined), '')
  assert.equal(formatWhole(14000), '14,000')
})

test('the caret keeps its place among the digits when commas are added', () => {
  // "1234|5" typed as 12345 with the caret after the 4th digit becomes "12,345": the caret sits after the 4 -> index 5
  assert.equal(caretAfterMask('12345', 4, '12,345'), 5)
  // typing at the end stays at the end
  assert.equal(caretAfterMask('12345', 5, '12,345'), 6)
  // a digit typed at the front of "234" -> "1234" masked "1,234": caret after the new 1 is index 1
  assert.equal(caretAfterMask('1234', 1, '1,234'), 1)
  // nothing left of the caret
  assert.equal(caretAfterMask('x5', 1, '5'), 0)
  // the minus is not a digit, so the caret after it sits at 1 in "-5"
  assert.equal(caretAfterMask('-', 1, '-'), 1)
})

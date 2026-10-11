import assert from 'node:assert/strict'
import test from 'node:test'
import { comparePredictions, isMatchVisible } from './match.js'

test('orders accepted predictions first and rejected predictions by ascending confidence', () => {
  const predictions = [
    { id: 'accepted-70', predicted_accepted: true, confidence: 0.7 },
    { id: 'accepted-60', predicted_accepted: true, confidence: 0.6 },
    { id: 'accepted-90', predicted_accepted: true, confidence: 0.9 },
    { id: 'rejected-70', predicted_accepted: false, confidence: 0.7 },
    { id: 'rejected-23', predicted_accepted: false, confidence: 0.23 },
    { id: 'rejected-45', predicted_accepted: false, confidence: 0.45 },
  ]

  assert.deepEqual(
    predictions.sort(comparePredictions).map(({ id }) => id),
    ['accepted-90', 'accepted-70', 'accepted-60', 'rejected-23', 'rejected-45', 'rejected-70'],
  )
})

test('shows match percentages only in the selected intent section', () => {
  assert.equal(isMatchVisible('have', 'sell'), true)
  assert.equal(isMatchVisible('have', 'buy'), false)
  assert.equal(isMatchVisible('need', 'buy'), true)
  assert.equal(isMatchVisible('need', 'sell'), false)
  assert.equal(isMatchVisible(null, 'buy'), false)
  assert.equal(isMatchVisible(null, 'sell'), false)
})
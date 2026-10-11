import assert from 'node:assert/strict'
import test from 'node:test'
import { INITIAL_LISTINGS } from '../data/seed.js'
import { calcImpact, EMISSION_FACTORS } from './impact.js'

test('uses the WARM net recycling factors converted from the exact model values', () => {
  assert.ok(Math.abs(EMISSION_FACTORS.glass.factor - 0.30433732434615207) < 1e-12)
  assert.ok(Math.abs(EMISSION_FACTORS.plastic.factor - 1.0202149197879966) < 1e-12)
  assert.ok(Math.abs(EMISSION_FACTORS.paper.factor - 3.908270766398367) < 1e-12)
  assert.equal(EMISSION_FACTORS.glass.sourceValue, -0.2760901764592596)
  assert.equal(EMISSION_FACTORS.glass.sourceTableValue, -0.28)
  assert.equal(EMISSION_FACTORS.plastic.sourceValue, -0.9255234067519946)
  assert.equal(EMISSION_FACTORS.plastic.sourceTableValue, -0.93)
  assert.equal(EMISSION_FACTORS.paper.sourceValue, -3.5455235990647034)
  assert.equal(EMISSION_FACTORS.paper.sourceTableValue, -3.55)
  assert.equal(EMISSION_FACTORS.glass.year, 2023)
  assert.equal(EMISSION_FACTORS.steelScrap.year, 2016)
})

test('calculates a one-off listed mass once, not over a trade term', () => {
  const impact = calcImpact(
    { material: 'glass', impactFactorKey: 'glass', qty: '320 kg' },
    6,
  )
  assert.ok(Math.abs(impact.kgCO2Total - 320 * EMISSION_FACTORS.glass.factor) < 1e-12)
  assert.deepEqual(Object.keys(impact), ['kgCO2Total'])
})

test('does not mistake an explicit recurring rate for a one-off trade quantity', () => {
  assert.equal(
    calcImpact({ material: 'glass', impactFactorKey: 'glass', qty: '320 kg / day' }),
    null,
  )
})

test('converts tonnes to kilograms before applying the factor', () => {
  const impact = calcImpact({ material: 'paper', impactFactorKey: 'paper', qty: '1.2 t' })
  assert.ok(Math.abs(impact.kgCO2Total - 1200 * EMISSION_FACTORS.paper.factor) < 1e-12)
})

test('demo listings use one-off quantities and documented factor categories', () => {
  const steel = INITIAL_LISTINGS.find(({ id }) => id === 'l1')
  const plastic = INITIAL_LISTINGS.find(({ id }) => id === 'l2')
  const paper = INITIAL_LISTINGS.find(({ id }) => id === 'l7')
  assert.equal(steel.qty, '500 kg')
  assert.equal(calcImpact(steel).kgCO2Total, 750)
  assert.equal(calcImpact(plastic).kgCO2Total, 800 * EMISSION_FACTORS.plastic.factor)
  assert.equal(calcImpact(paper).kgCO2Total, 1200 * EMISSION_FACTORS.paper.factor)
  assert.equal(calcImpact(INITIAL_LISTINGS.find(({ id }) => id === 'l3')), null)
})

test('applies the end-of-life closed-loop steel-scrap benchmark to generic steel listings', () => {
  const impact = calcImpact({ material: 'steel', qty: '500 kg' })
  assert.equal(impact.kgCO2Total, 750)
  assert.equal(
    EMISSION_FACTORS.steelScrap.assumptions.includes('For all generic steel listings'),
    true,
  )
  assert.ok(calcImpact({
    material: 'steel',
    materialForm: 'scrap',
    recyclingRoute: 'closed-loop-new-steel',
    qty: '500 kg',
  }))
})

test('returns no estimate for unsupported, incompatible, or invalid quantities', () => {
  assert.equal(calcImpact({ material: 'heat', qty: '2,000 kWh' }), null)
  assert.equal(calcImpact({ material: 'water', qty: '5,000 L' }), null)
  assert.equal(calcImpact({ material: 'other', qty: '100 kg' }), null)
  assert.ok(calcImpact({ material: 'glass', qty: '1 kg' }))
  assert.equal(calcImpact({ material: 'glass', impactFactorKey: 'glass', qty: '-2 kg' }), null)
  assert.equal(calcImpact({ material: 'glass', impactFactorKey: 'glass', qty: '0 kg' }), null)
  assert.equal(calcImpact({ material: 'glass', impactFactorKey: 'glass', qty: '1,2 kg' }), null)
  assert.equal(calcImpact({ material: 'glass', impactFactorKey: 'glass', qty: 'not a quantity' }), null)
})

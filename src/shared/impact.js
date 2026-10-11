import emissionFactorData from '../data/emission-factors.json' with { type: 'json' }
import { parseQty } from './match.js'

export const EMISSION_FACTORS = emissionFactorData.factors

function factorForListing(listing) {
  const material = String(listing.material || '').trim().toLowerCase()
  return EMISSION_FACTORS[material === 'steel' ? 'steelScrap' : material] || null
}

export function calcImpact(listing) {
  const entry = factorForListing(listing)
  if (!entry || !Number.isFinite(entry.factor) || entry.factor <= 0) return null

  const oneOffMass =
    /^\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:kg|t)\s*$/i.test(String(listing.qty))
  if (!oneOffMass) return null

  const quantity = parseQty(listing.qty)
  if (quantity.unit !== 'kg' || !Number.isFinite(quantity.value) || quantity.value <= 0) {
    return null
  }

  return {
    kgCO2Total: quantity.value * entry.factor,
  }
}

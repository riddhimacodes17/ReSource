const EARTH_RADIUS_KM = 6371
const DEFAULT_WEIGHTS = { distance: 0.35, quantity: 0.35, reliability: 0.3 }

export function haversineKm(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(b.lat - a.lat)
  const longitudeDelta = toRadians(b.lng - a.lng)
  const latitudeA = toRadians(a.lat)
  const latitudeB = toRadians(b.lat)
  const haversine = clamp(
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2,
    0,
    1,
  )

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function parseQty(str) {
  const match = String(str).match(/^\s*([\d,]+(?:\.\d+)?)\s*(kg|t|kwh|l)\b/i)
  if (!match) return { value: Number.NaN, unit: '' }

  const quantity = Number(match[1].replaceAll(',', ''))
  const unit = match[2].toLowerCase()
  if (unit === 't') return { value: quantity * 1000, unit: 'kg' }
  if (unit === 'kwh') return { value: quantity, unit: 'kWh' }
  if (unit === 'l') return { value: quantity, unit: 'L' }
  return { value: quantity, unit: 'kg' }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function scoreMatch(need, offer, weights = DEFAULT_WEIGHTS) {
  const needMaterial = String(need.material || '').toLowerCase()
  const offerMaterial = String(offer.material || '').toLowerCase()
  const material = needMaterial && offerMaterial && needMaterial === offerMaterial
    ? 1
    : needMaterial && offerMaterial && (needMaterial === 'other' || offerMaterial === 'other')
      ? 0.3
      : 0

  const distanceKm = Number.isFinite(offer.distance) ? offer.distance : need.distance
  const distance = Number.isFinite(distanceKm)
    ? clamp(1 - Math.max(0, distanceKm) / 50, 0, 1)
    : 0

  const needQty = parseQty(need.qty)
  const offerQty = parseQty(offer.qty)
  const quantity =
    needQty.unit &&
    needQty.unit === offerQty.unit &&
    Number.isFinite(needQty.value) &&
    Number.isFinite(offerQty.value) &&
    Math.max(needQty.value, offerQty.value) > 0
      ? Math.min(needQty.value, offerQty.value) / Math.max(needQty.value, offerQty.value)
      : 0
  const reliability = Number.isFinite(offer.reliability)
    ? clamp(offer.reliability / 5, 0, 1)
    : 0

  const effectiveWeights = { ...DEFAULT_WEIGHTS, ...weights }
  const weightTotal = Object.keys(DEFAULT_WEIGHTS).reduce(
    (total, key) => total + Math.max(0, Number(effectiveWeights[key]) || 0),
    0,
  )
  const weightedScore = weightTotal
    ? (
      distance * Math.max(0, Number(effectiveWeights.distance) || 0) +
      quantity * Math.max(0, Number(effectiveWeights.quantity) || 0) +
      reliability * Math.max(0, Number(effectiveWeights.reliability) || 0)
    ) / weightTotal
    : 0
  const score = material === 0 ? 0 : Math.round(weightedScore * material * 100)
  const reasons = []

  if (needMaterial === offerMaterial) reasons.push('Same material')
  else if (material > 0) reasons.push('Other material category is compatible')
  else reasons.push('Different materials')

  if (Number.isFinite(distanceKm)) reasons.push(`${distanceKm.toFixed(1)} km away`)
  else reasons.push('Distance unavailable')

  if (quantity > 0) reasons.push(`Quantity covers ${Math.round(quantity * 100)}% of need`)
  else if (needQty.unit && offerQty.unit && needQty.unit !== offerQty.unit) {
    reasons.push('Quantity units do not match')
  } else {
    reasons.push('Quantity could not be compared')
  }

  if (Number.isFinite(offer.reliability)) {
    reasons.push(`Reliability ${clamp(offer.reliability, 0, 5).toFixed(1)}/5`)
  } else {
    reasons.push('Reliability unavailable')
  }

  return {
    score,
    breakdown: {
      material: Math.round(material * 100),
      distance: Math.round(distance * 100),
      quantity: Math.round(quantity * 100),
      reliability: Math.round(reliability * 100),
    },
    reasons,
  }
}

export function rankMatches(userStream, listings, nodes) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const sourceLocation = nodeById.get(userStream.nodeId) || userStream

  return listings
    .map((listing) => {
      const listingNode = nodeById.get(listing.nodeId)
      const distance = sourceLocation.lat != null && listingNode
        ? haversineKm(sourceLocation, listingNode)
        : undefined
      const match = scoreMatch({ ...userStream, distance: undefined }, { ...listing, distance })

      return { ...listing, distance, ...match }
    })
    .sort((a, b) => b.score - a.score)
}

const EARTH_RADIUS_KM = 6371

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

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

export function predictionPairId(mode, listing, opposite) {
  return mode === 'sell'
    ? `${listing.id}:${opposite.id}`
    : `${opposite.id}:${listing.id}`
}

export function buildPredictionPairs(mode, listings, nodes, oppositeListingIds) {
  const rowsForMode = listings.filter((listing) => listing.mode === mode)
  const oppositeMode = listings.filter((listing) =>
    listing.mode !== mode &&
    (!oppositeListingIds || oppositeListingIds.includes(listing.id)),
  )
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  return rowsForMode.flatMap((listing) => oppositeMode.map((opposite) => {
    const buyer = mode === 'sell' ? listing : opposite
    const seller = mode === 'sell' ? opposite : listing
    const buyerNode = nodeById.get(buyer.nodeId)
    const sellerNode = nodeById.get(seller.nodeId)
    const distanceKm = buyerNode && sellerNode
      ? haversineKm(buyerNode, sellerNode)
      : null

    return {
      id: predictionPairId(mode, listing, opposite),
      buyer: { material: buyer.material, title: buyer.title, qty: buyer.qty },
      seller: { material: seller.material, title: seller.title, qty: seller.qty },
      distance_km: distanceKm,
    }
  }))
}

export function comparePredictions(a, b) {
  if (!a) return b ? 1 : 0
  if (!b) return -1
  if (a.predicted_accepted !== b.predicted_accepted) {
    return a.predicted_accepted ? -1 : 1
  }
  return a.predicted_accepted
    ? b.confidence - a.confidence
    : a.confidence - b.confidence
}

export function isMatchVisible(intent, mode) {
  return (intent === 'have' && mode === 'sell') || (intent === 'need' && mode === 'buy')
}

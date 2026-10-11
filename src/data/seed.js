export const MATERIALS = ['steel', 'plastic', 'paper', 'glass', 'heat', 'water', 'CO₂', 'other']

export const INITIAL_NODES = [
  { id: 'greenpack', lat: 12.9716, lng: 77.6412, type: 'buyer', name: 'GreenPack Industries', material: 'plastic', note: 'Needs plastic pellets' },
  { id: 'ecosteel', lat: 12.955, lng: 77.568, type: 'provider', name: 'EcoSteel Industries', material: 'steel', note: 'Offers scrap steel' },
  { id: 'polyloop', lat: 12.986, lng: 77.603, type: 'provider', name: 'PolyLoop Ltd', material: 'plastic', note: 'Offers plastic pellets' },
  { id: 'printworks', lat: 13.003, lng: 77.59, type: 'buyer', name: 'PrintWorks Co', material: 'paper', note: 'Needs paper scrap' },
  { id: 'forge', lat: 12.936, lng: 77.577, type: 'provider', name: 'Forge & Form', material: 'glass', note: 'Offers glass cullet' },
  { id: 'aquacycle', lat: 12.944, lng: 77.622, type: 'provider', name: 'AquaCycle Industries', material: 'water', note: 'Offers process water' },
  { id: 'northmill', lat: 12.957, lng: 77.632, type: 'other', name: 'North Mill', material: 'other', note: 'Idle capacity' },
  { id: 'delta', lat: 12.969, lng: 77.548, type: 'other', name: 'Delta Plant', material: 'other', note: 'Observing' },
]

export const INITIAL_LISTINGS = [
  { id: 'l1', mode: 'buy', material: 'steel', impactFactorKey: 'steelScrap', materialForm: 'scrap', recyclingRoute: 'closed-loop-new-steel', title: 'Scrap Steel', qty: '500 kg', company: 'EcoSteel Industries', nodeId: 'ecosteel', reliability: 4.8, save: 420, industry: 'Metals' },
  { id: 'l2', mode: 'buy', material: 'plastic', impactFactorKey: 'plastic', title: 'Plastic Pellets', qty: '800 kg', company: 'PolyLoop Ltd', nodeId: 'polyloop', reliability: 4.6, save: 780, industry: 'Packaging' },
  { id: 'l4', mode: 'buy', material: 'water', title: 'Process Water', qty: '5,000 L', company: 'AquaCycle Industries', nodeId: 'aquacycle', reliability: 4.2, save: 620, industry: 'Utilities' },
  { id: 'l5', mode: 'buy', material: 'glass', impactFactorKey: 'glass', title: 'Glass Cullet', qty: '320 kg', company: 'Forge & Form', nodeId: 'forge', reliability: 4.5, save: 190, industry: 'Materials' },
  { id: 'l6', mode: 'sell', material: 'plastic', impactFactorKey: 'plastic', title: 'Plastic Pellets', qty: '800 kg', company: 'GreenPack Industries', nodeId: 'greenpack', reliability: 4.7, save: 780, industry: 'Packaging' },
  { id: 'l7', mode: 'sell', material: 'paper', impactFactorKey: 'paper', title: 'Paper Scrap', qty: '1.2 t', company: 'PrintWorks Co', nodeId: 'printworks', reliability: 4.1, save: 240, industry: 'Print' },
]

export const INDUSTRIES = ['All', 'Metals', 'Packaging', 'Energy', 'Utilities', 'Materials', 'Print', 'Ceramics']

export const DISTANCES = [
  { id: 'all', label: 'Any distance' },
  { id: '5', label: 'Under 5 km' },
  { id: '8', label: 'Under 8 km' },
  { id: '12', label: 'Under 12 km' },
]

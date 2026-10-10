import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const MATERIALS = ['steel', 'plastic', 'paper', 'glass', 'heat', 'water', 'CO₂', 'other']

const INITIAL_NODES = [
  { id: 'greenpack', lat: 12.9716, lng: 77.6412, type: 'buyer', name: 'GreenPack Industries', material: 'plastic', note: 'Needs plastic pellets' },
  { id: 'ecosteel', lat: 12.955, lng: 77.568, type: 'provider', name: 'EcoSteel Industries', material: 'steel', note: 'Offers scrap steel' },
  { id: 'polyloop', lat: 12.986, lng: 77.603, type: 'provider', name: 'PolyLoop Ltd', material: 'plastic', note: 'Offers plastic pellets' },
  { id: 'thermal', lat: 12.968, lng: 77.625, type: 'provider', name: 'Thermal Solutions Ltd', material: 'heat', note: 'Offers waste heat' },
  { id: 'printworks', lat: 13.003, lng: 77.59, type: 'buyer', name: 'PrintWorks Co', material: 'paper', note: 'Needs paper scrap' },
  { id: 'forge', lat: 12.936, lng: 77.577, type: 'provider', name: 'Forge & Form', material: 'glass', note: 'Offers glass cullet' },
  { id: 'aquacycle', lat: 12.944, lng: 77.622, type: 'provider', name: 'AquaCycle Industries', material: 'water', note: 'Offers process water' },
  { id: 'northmill', lat: 12.957, lng: 77.632, type: 'other', name: 'North Mill', material: 'other', note: 'Idle capacity' },
  { id: 'delta', lat: 12.969, lng: 77.548, type: 'other', name: 'Delta Plant', material: 'other', note: 'Observing' },
  { id: 'kiln', lat: 12.987, lng: 77.635, type: 'buyer', name: 'Kiln District', material: 'heat', note: 'Needs process heat' },
]

const INITIAL_LISTINGS = [
  { id: 'l1', mode: 'buy', material: 'steel', title: 'Scrap Steel', qty: '500 kg / day', company: 'EcoSteel Industries', nodeId: 'ecosteel', distance: 4.2, reliability: 4.8, save: 420, industry: 'Metals' },
  { id: 'l2', mode: 'buy', material: 'plastic', title: 'Plastic Pellets', qty: '800 kg / day', company: 'PolyLoop Ltd', nodeId: 'polyloop', distance: 6.1, reliability: 4.6, save: 780, industry: 'Packaging' },
  { id: 'l3', mode: 'buy', material: 'heat', title: 'Waste Heat', qty: '2,000 kWh / day', company: 'Thermal Solutions Ltd', nodeId: 'thermal', distance: 7.3, reliability: 4.4, save: 310, industry: 'Energy' },
  { id: 'l4', mode: 'buy', material: 'water', title: 'Process Water', qty: '5,000 L / day', company: 'AquaCycle Industries', nodeId: 'aquacycle', distance: 8.7, reliability: 4.2, save: 620, industry: 'Utilities' },
  { id: 'l5', mode: 'buy', material: 'glass', title: 'Glass Cullet', qty: '320 kg / day', company: 'Forge & Form', nodeId: 'forge', distance: 5.4, reliability: 4.5, save: 190, industry: 'Materials' },
  { id: 'l6', mode: 'sell', material: 'plastic', title: 'Plastic Pellets', qty: '800 kg / day', company: 'GreenPack Industries', nodeId: 'greenpack', distance: 6.1, reliability: 4.7, save: 780, industry: 'Packaging' },
  { id: 'l7', mode: 'sell', material: 'paper', title: 'Paper Scrap', qty: '1.2 t / day', company: 'PrintWorks Co', nodeId: 'printworks', distance: 9.4, reliability: 4.1, save: 240, industry: 'Print' },
  { id: 'l8', mode: 'sell', material: 'heat', title: 'Process Heat', qty: '1,400 kWh / day', company: 'Kiln District', nodeId: 'kiln', distance: 7.3, reliability: 4.3, save: 310, industry: 'Ceramics' },
]

const INDUSTRIES = ['All', 'Metals', 'Packaging', 'Energy', 'Utilities', 'Materials', 'Print', 'Ceramics']
const DISTANCES = [
  { id: 'all', label: 'Any distance' },
  { id: '5', label: 'Under 5 km' },
  { id: '8', label: 'Under 8 km' },
  { id: '12', label: 'Under 12 km' },
]

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function Header({ streams, saved, co2 }) {
  return (
    <header className="relative z-30 flex items-start justify-between gap-6 px-5 pt-6 sm:px-8 lg:px-10">
      <div>
        <p className="text-[15px] font-semibold tracking-[-0.03em]">ReSource</p>
      </div>
      <p className="max-w-[70%] text-right text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
        [{streams}] streams diverted / ${saved.toLocaleString()} saved / [{co2.toLocaleString()}] kg CO₂ avoided
      </p>
    </header>
  )
}

function HeroCopy({ progress, side, setSide, onListStream }) {
  const t = easeInOut(progress)
  const scale = 1 - t * 0.62
  const shiftY = t * -28
  const fade = 1 - t

  return (
    <div
      className="relative z-20 max-w-[36rem] px-5 pt-10 sm:px-8 lg:px-10"
      style={{
        transform: `translate3d(0, ${shiftY}px, 0) scale(${scale})`,
        transformOrigin: 'top left',
        opacity: 1 - t * 0.08,
      }}
    >
      <p
        className="mb-5 text-[11px] font-medium uppercase tracking-[0.22em] text-muted"
        style={{ opacity: fade }}
      >
        Which side are you on today?
      </p>

      <button
        type="button"
        onClick={() => setSide('have')}
        className={`group flex w-full items-center gap-3 text-left ${side === 'have' ? 'text-ink' : 'text-ink/55'}`}
      >
        <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-provider" />
        <span className="border-b border-ink pb-1 text-[clamp(52px,8.4vw,92px)] font-semibold leading-[0.92] tracking-[-0.045em]">
          I have it.
        </span>
      </button>

      <button
        type="button"
        onClick={() => setSide('need')}
        className={`mt-3 flex w-full items-center gap-3 text-left transition-opacity duration-300 ${side === 'need' ? 'text-ink' : 'text-ink/50'}`}
        style={{ opacity: side === 'need' ? 1 : 0.4 }}
      >
        <span className="mt-2 h-3 w-3 shrink-0 rounded-full border-[2.5px] border-buyer" />
        <span className="text-[clamp(52px,8.4vw,92px)] font-semibold leading-[0.92] tracking-[-0.045em] text-buyer">
          I need it.
        </span>
      </button>

      <p
        className="mt-8 max-w-sm text-[12px] leading-relaxed text-muted"
        style={{ opacity: fade }}
      >
        steel / plastic / paper / glass / heat / water / CO₂ / [other]
      </p>

      <button
        type="button"
        onClick={onListStream}
        className="mt-7 border border-ink/70 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] transition hover:bg-ink hover:text-paper"
        style={{ opacity: fade }}
      >
        List a stream →
      </button>
    </div>
  )
}

function CompactSwitcher({ side, setSide, onListStream }) {
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 bg-paper px-5 py-3 sm:px-8 lg:px-10">
      <div className="flex items-baseline gap-6">
        <button
          type="button"
          onClick={() => setSide('have')}
          className={`flex items-center gap-2 text-[22px] font-semibold tracking-[-0.04em] ${side === 'have' ? 'text-ink' : 'text-ink/35'}`}
        >
          <span className="h-2 w-2 rounded-full bg-provider" />
          I have it.
        </button>
        <button
          type="button"
          onClick={() => setSide('need')}
          className={`flex items-center gap-2 text-[22px] font-semibold tracking-[-0.04em] ${side === 'need' ? 'text-buyer' : 'text-buyer/35'}`}
        >
          <span className="h-2.5 w-2.5 rounded-full border-2 border-current" />
          I need it.
        </button>
      </div>
      <button
        type="button"
        onClick={onListStream}
        className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink"
      >
        List a stream →
      </button>
    </div>
  )
}

function HeroNetwork() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path d="M720 0 C710 180 740 320 718 900" fill="none" stroke="#cfd4d8" strokeWidth="18" opacity="0.55" />
      <path d="M80 210 C360 180 620 280 980 210 S1320 120 1420 160" fill="none" stroke="#c5c8bf" strokeWidth="1.1" />
      <path d="M40 430 C300 390 540 520 880 430 S1240 340 1440 390" fill="none" stroke="#c5c8bf" strokeWidth="1.1" />
      <path d="M20 640 C340 600 600 720 940 610 S1280 540 1460 590" fill="none" stroke="#c5c8bf" strokeWidth="1.1" />
      <path d="M120 760 C420 700 700 780 1100 690" fill="none" stroke="#c5c8bf" strokeWidth="1" />
      <path
        d="M560 390 C700 330 820 360 930 330"
        fill="none"
        stroke="#8a8e86"
        strokeWidth="1.4"
        strokeDasharray="5 6"
        className="network-flow"
      />
      <circle cx="560" cy="390" r="7" fill="#2f7a3c" />
      <circle cx="560" cy="390" r="14" fill="none" stroke="#2f7a3c" strokeWidth="1" className="node-halo" />
      <circle cx="930" cy="330" r="8" fill="none" stroke="#3b6fd8" strokeWidth="2.2" />
      <circle cx="260" cy="210" r="7" fill="none" stroke="#3b6fd8" strokeWidth="2" />
      <circle cx="410" cy="620" r="6.5" fill="#2f7a3c" />
      <circle cx="780" cy="670" r="11" fill="none" stroke="#2f7a3c" strokeWidth="2" />
      <circle cx="780" cy="670" r="5" fill="#2f7a3c" />
      <circle cx="1080" cy="560" r="7" fill="none" stroke="#3b6fd8" strokeWidth="2" />
      <text x="700" y="318" fill="#6a6e66" fontSize="11" letterSpacing="1.6">
        MATCH · [92%] · [4.2 km]
      </text>
    </svg>
  )
}

function companyPinIcon(node, selected) {
  const color = node.type === 'buyer'
    ? 'buyer'
    : node.type === 'provider'
      ? 'provider'
      : 'other'
  return L.divIcon({
    className: `company-map-marker${selected ? ' is-selected' : ''}`,
    html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pin-${color}" d="M12 22s8-4.5 8-12a8 8 0 1 0-16 0c0 7.5 8 12 8 12Z"/><circle cx="12" cy="10" r="2.6" class="pin-center"/></svg>`,
    iconSize: [26, 32],
    iconAnchor: [13, 31],
  })
}

function IndustrialMap({ selectedId, onSelect, extraNodes }) {
  const mapElement = useRef(null)
  const markerLayer = useRef(null)
  const markers = useRef(new Map())
  const onSelectRef = useRef(onSelect)
  const nodes = useMemo(() => [...INITIAL_NODES, ...extraNodes], [extraNodes])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const markerRegistry = markers.current
    const map = L.map(mapElement.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView([12.97, 77.594], 12)
    markerLayer.current = L.layerGroup().addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    map.on('click', () => onSelectRef.current(null))
    const resizeObserver = new ResizeObserver(() => map.invalidateSize())
    resizeObserver.observe(mapElement.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      markerLayer.current = null
      markerRegistry.clear()
    }
  }, [])

  useEffect(() => {
    if (!markerLayer.current) return
    markerLayer.current.clearLayers()
    markers.current.clear()

    nodes.forEach((node) => {
      const marker = L.marker([node.lat, node.lng], {
        icon: companyPinIcon(node, false),
        keyboard: true,
        title: `${node.name} — ${node.type === 'buyer' ? 'Buyer' : node.type === 'provider' ? 'Supplier' : 'Other company'}`,
      })
      const popup = document.createElement('div')
      const companyName = document.createElement('strong')
      companyName.textContent = node.name
      const companyNote = document.createElement('div')
      companyNote.textContent = node.note
      popup.append(companyName, companyNote)
      marker.bindPopup(popup)
      marker.on('click', () => onSelectRef.current(node.id))
      markers.current.set(node.id, marker)
      markerLayer.current.addLayer(marker)
    })
  }, [nodes])

  useEffect(() => {
    nodes.forEach((node) => {
      const marker = markers.current.get(node.id)
      if (!marker) return
      const selected = node.id === selectedId
      marker.setIcon(companyPinIcon(node, selected))
      marker.setZIndexOffset(selected ? 1000 : 0)
    })
  }, [nodes, selectedId])

  return (
    <div className="relative h-[min(48vh,30rem)] min-h-[18rem] overflow-hidden border-r border-ink/10 bg-[#e4e7df] lg:h-[min(55vh,34rem)] lg:min-h-[24rem] lg:self-start">
      <div
        ref={mapElement}
        className="h-full w-full"
        role="application"
        aria-label="OpenStreetMap of Bengaluru with buyer and supplier locations"
      />
      <div className="pointer-events-none absolute right-3 top-3 z-[500] border border-ink/15 bg-paper/90 px-2.5 py-1.5 text-[10px] text-ink/80">
        Approximate demo locations · Bengaluru
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 border border-ink/15 bg-paper/90 px-2.5 py-2 text-[9px] uppercase tracking-[0.08em] text-ink/80">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-buyer" /> Buyer</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-provider" /> Supplier</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#858b80]" /> Other</span>
      </div>
    </div>
  )
}
// map ends

function Marketplace({
  mode,
  setMode,
  listings,
  selectedId,
  onSelect,
  accepted,
  onAccept,
}) {
  const [query, setQuery] = useState('')
  const [material, setMaterial] = useState('all')
  const [distance, setDistance] = useState('all')
  const [industry, setIndustry] = useState('All')
  const [sort, setSort] = useState('picks')

  const filtered = useMemo(() => {
    let rows = listings.filter((l) => l.mode === mode)
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((l) =>
        `${l.title} ${l.company} ${l.material}`.toLowerCase().includes(q),
      )
    }
    if (material !== 'all') rows = rows.filter((l) => l.material === material)
    if (industry !== 'All') rows = rows.filter((l) => l.industry === industry)
    if (distance !== 'all') rows = rows.filter((l) => l.distance <= Number(distance))

    rows = [...rows].sort((a, b) => {
      if (sort === 'save') return b.save - a.save
      if (sort === 'near') return a.distance - b.distance
      if (sort === 'trust') return b.reliability - a.reliability
      return b.reliability * 10 - a.distance - (a.save > b.save ? 0 : 2)
    })
    return rows
  }, [listings, mode, query, material, distance, industry, sort])

  return (
    <div className="flex h-full min-h-[420px] flex-col bg-paper">
      <div className="flex items-end justify-between gap-4 border-b border-ink/10 px-5 py-4">
        <h2 className="text-[22px] font-semibold tracking-[-0.04em]">Marketplace</h2>
        <div className="flex text-[11px] font-medium uppercase tracking-[0.18em]">
          <button
            type="button"
            onClick={() => setMode('buy')}
            className={`px-3 py-1 ${mode === 'buy' ? 'text-ink' : 'text-ink/30'}`}
          >
            Buy
          </button>
          <span className="text-ink/20">/</span>
          <button
            type="button"
            onClick={() => setMode('sell')}
            className={`px-3 py-1 ${mode === 'sell' ? 'text-ink' : 'text-ink/30'}`}
          >
            Sell
          </button>
        </div>
      </div>

      <div className="space-y-3 border-b border-ink/10 px-5 py-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search materials, companies…"
          className="w-full border-b border-ink/20 bg-transparent pb-2 text-sm outline-none placeholder:text-muted/70 focus:border-ink"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="border border-ink/15 bg-transparent px-2 py-1.5 text-[11px] uppercase tracking-[0.12em] outline-none"
          >
            <option value="all">Material</option>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            className="border border-ink/15 bg-transparent px-2 py-1.5 text-[11px] uppercase tracking-[0.12em] outline-none"
          >
            {DISTANCES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="border border-ink/15 bg-transparent px-2 py-1.5 text-[11px] uppercase tracking-[0.12em] outline-none"
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="ml-auto border border-ink/15 bg-transparent px-2 py-1.5 text-[11px] uppercase tracking-[0.12em] outline-none"
          >
            <option value="picks">Our top picks</option>
            <option value="near">Nearest</option>
            <option value="save">Highest savings</option>
            <option value="trust">Reliability</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-5 py-10 text-sm text-muted">No streams match these filters.</p>
        )}
        {filtered.map((item) => {
          const isOn = selectedId === item.nodeId
          const isAccepted = accepted[item.id]
          return (
            <article
              key={item.id}
              onClick={() => onSelect(item.nodeId)}
              className={`grid cursor-pointer grid-cols-[1fr_auto] gap-3 border-b border-ink/10 px-5 py-4 transition ${
                isOn ? 'bg-[#dfe4d6]' : 'hover:bg-[#eef0e9]'
              }`}
            >
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.03em]">{item.title}</p>
                <p className="mt-0.5 text-[12px] text-muted">{item.qty} available</p>
                <p className="mt-2 text-[13px]">{item.company}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted">
                  {item.distance} km · ★ {item.reliability.toFixed(1)} reliability
                </p>
              </div>
              <div className="flex min-w-[7.5rem] flex-col items-end justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(item.nodeId)
                    onAccept(item)
                  }}
                  className={`mt-3 border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] ${
                    isAccepted
                      ? 'border-provider text-provider'
                      : 'border-ink/70 hover:bg-ink hover:text-paper'
                  }`}
                >
                  {isAccepted ? 'Matched' : 'Make An Offer'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function TradeSide({ title, company, tone, offers, setOffers }) {
  function addOffer() {
    if (offers.length >= 4) return
    setOffers((current) => [
      ...current,
      { kind: 'resource', label: '', amount: '', unit: '', editing: true },
    ])
  }

  function updateOffer(index, changes) {
    setOffers((current) =>
      current.map((offer, offerIndex) =>
        offerIndex === index ? { ...offer, ...changes } : offer,
      ),
    )
  }

  function removeOffer(index) {
    setOffers((current) => current.filter((_, offerIndex) => offerIndex !== index))
  }

  return (
    <section className="min-w-0">
      <h3 className="flex items-center gap-2 border-b-2 border-ink pb-2 text-base font-semibold">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${tone === 'buyer' ? 'border-2 border-buyer' : 'bg-provider'}`}
        />
        <span className="truncate">{title} · [{company}]</span>
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((slot) => {
          const offer = offers[slot]
          return offer ? (
            <div key={slot} className="relative flex min-h-32 flex-col border border-ink/40 p-2 sm:min-h-36 sm:p-3">
              <span className="font-mono text-[9px] text-muted">0{slot + 1}</span>
              <span className="mt-2 text-[9px] uppercase tracking-[0.08em] text-muted">
                {offer.kind === 'cash' ? 'Cash' : 'Resource'}
              </span>
              <strong className="mt-1 break-words text-[13px] leading-tight">
                {offer.label || (offer.kind === 'cash' ? 'Price' : 'Resource name')}
              </strong>
              <span className="mt-1 text-[10px] text-muted">
                {offer.amount || (offer.kind === 'cash' ? 'Enter amount' : 'Enter quantity')}
                {offer.unit ? ` · ${offer.unit}` : ''}
              </span>
              <button
                type="button"
                onClick={() => removeOffer(slot)}
                className="mt-auto self-end pt-2 text-[9px] uppercase tracking-[0.08em] text-muted hover:text-ink"
                aria-label={`Remove ${offer.label || offer.kind} from ${title}`}
              >
                × Remove
              </button>
              {offer.editing && (
                <div className="absolute inset-0 z-10 flex flex-col gap-1.5 border border-ink bg-paper p-2 shadow-lg">
                  <select
                    value={offer.kind}
                    onChange={(event) => updateOffer(slot, {
                      kind: event.target.value,
                      label: '',
                      amount: '',
                      unit: '',
                    })}
                    className="w-full border-b border-ink/20 bg-transparent py-1 text-[10px] outline-none"
                    aria-label="Offer type"
                  >
                    <option value="resource">Resource</option>
                    <option value="cash">Cash</option>
                  </select>
                  <input
                    autoFocus
                    value={offer.label}
                    onChange={(event) => updateOffer(slot, { label: event.target.value })}
                    placeholder={offer.kind === 'cash' ? 'Price' : 'Resource name'}
                    className="w-full border-b border-ink/20 bg-transparent py-1 text-[10px] outline-none"
                    aria-label="Offer name"
                  />
                  <input
                    value={offer.amount}
                    onChange={(event) => updateOffer(slot, { amount: event.target.value })}
                    placeholder={offer.kind === 'cash' ? 'Amount (INR)' : 'Quantity'}
                    className="w-full border-b border-ink/20 bg-transparent py-1 text-[10px] outline-none"
                    aria-label="Offer amount"
                  />
                  <input
                    value={offer.unit}
                    onChange={(event) => updateOffer(slot, { unit: event.target.value })}
                    placeholder={offer.kind === 'cash' ? 'e.g. per kg' : 'e.g. kg / day'}
                    className="w-full border-b border-ink/20 bg-transparent py-1 text-[10px] outline-none"
                    aria-label="Offer unit"
                  />
                  <button
                    type="button"
                    onClick={() => updateOffer(slot, { editing: false })}
                    className="mt-auto self-end text-[9px] uppercase tracking-[0.08em] underline"
                  >
                    Done
                  </button>
                </div>
              )}
              {!offer.editing && (
                <button
                  type="button"
                  onClick={() => updateOffer(slot, { editing: true })}
                  className="absolute right-2 top-2 text-[9px] uppercase tracking-[0.08em] text-muted underline hover:text-ink"
                  aria-label={`Edit ${offer.label || offer.kind} offer`}
                >
                  Edit
                </button>
              )}
            </div>
          ) : (
            <button
              key={slot}
              type="button"
              onClick={addOffer}
              disabled={offers.length >= 4}
              className="flex min-h-32 items-center justify-center border border-dashed border-ink/25 text-2xl text-muted transition hover:border-ink/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-36"
              aria-label={`Add offer to ${title}`}
            >
              +
            </button>
          )
        })}
      </div>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
        {title === 'You' ? 'You give' : 'They give'} · value [—]
      </p>
    </section>
  )
}

function TradeModal({ item, onClose, onComplete }) {
  const userStartsWithCash = item.mode === 'buy'
  const [yourOffers, setYourOffers] = useState([
    userStartsWithCash
      ? { kind: 'cash', label: 'Price', amount: '', unit: 'INR per kg' }
      : { kind: 'resource', label: item.title, amount: item.qty, unit: '' },
  ])
  const [theirOffers, setTheirOffers] = useState([
    userStartsWithCash
      ? { kind: 'resource', label: item.title, amount: item.qty, unit: '' }
      : { kind: 'cash', label: 'Price', amount: '', unit: 'INR per kg' },
  ])
  const [acceptedBy, setAcceptedBy] = useState({ you: false, them: false })
  const [isComplete, setIsComplete] = useState(false)

  function accept(side) {
    if (isComplete) return
    const next = { ...acceptedBy, [side]: true }
    setAcceptedBy(next)
    if (next.you && next.them) {
      setIsComplete(true)
      onComplete()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-title"
        className="relative max-h-[94vh] w-full max-w-5xl overflow-y-auto border border-ink/50 bg-paper p-4 shadow-[0_20px_80px_rgba(20,22,20,0.2)] sm:p-6 lg:p-10"
      >
        <div className="flex items-center justify-between gap-4 font-mono text-[9px] uppercase tracking-[0.08em] sm:text-[10px]">
          <p>Trade · Match [{Math.round(item.reliability * 19.2)}%] · [{item.distance} km]</p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-muted hover:text-ink"
            aria-label="Close trade"
          >
            × Close
          </button>
        </div>
        <h2 id="trade-title" className="mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
          Build the trade.
        </h2>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-start gap-2 sm:mt-8 sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] sm:gap-4">
          <TradeSide
            title="You"
            company="Your Company"
            tone={userStartsWithCash ? 'buyer' : 'provider'}
            offers={yourOffers}
            setOffers={setYourOffers}
          />
          <div className="flex flex-col items-center pt-14 text-center font-mono text-[8px] uppercase tracking-[0.08em] sm:pt-14 sm:text-[10px]">
            <span>Trade</span>
            <span className="mt-3 text-2xl leading-none sm:mt-4 sm:text-4xl">→</span>
            <span className="-mt-1 text-2xl leading-none sm:-mt-2 sm:text-4xl">←</span>
            <button type="button" className="mt-3 underline sm:mt-5">Rules</button>
          </div>
          <TradeSide
            title="Company B"
            company={item.company}
            tone={userStartsWithCash ? 'provider' : 'buyer'}
            offers={theirOffers}
            setOffers={setTheirOffers}
          />
        </div>

        <div className="mt-5 border-t-2 border-ink pt-3 font-mono text-[9px] uppercase tracking-[0.04em] text-muted sm:mt-6 sm:text-[10px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Balance: difference [—] · Term [6 months] · Delivery [pickup by B]</span>
            <span>[—] kg CO₂ avoided</span>
          </div>
        </div>

        <div className="mt-5 border-t border-ink/15 pt-4 sm:mt-6">
          <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.06em] text-muted sm:text-[10px]">
            <span>{acceptedBy.you ? 'You accepted' : 'You not accepted'}</span>
            <div className="hidden flex-1 items-center justify-center sm:flex" aria-hidden="true">
              <span className="w-3/4 border-t-2 border-dashed border-ink/30" />
              <span className="-ml-2 h-4 w-4 rotate-45 border-2 border-ink/40 bg-paper" />
            </div>
            <span>{acceptedBy.them ? 'Company accepted' : 'Company waiting'}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted underline hover:text-ink"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => accept('you')}
              disabled={acceptedBy.you || isComplete}
              className="border-2 border-ink px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-ink hover:text-paper disabled:cursor-default disabled:opacity-60 sm:px-8"
            >
              <span className="mr-2 text-provider">●</span>
              {acceptedBy.you ? 'You accepted' : 'You accept'}
            </button>
            <button
              type="button"
              onClick={() => accept('them')}
              disabled={acceptedBy.them || isComplete}
              className="border-2 border-ink px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-ink hover:text-paper disabled:cursor-default disabled:opacity-60 sm:px-8"
            >
              <span className="mr-2 text-buyer">○</span>
              {acceptedBy.them ? 'Company accepted' : `${item.company} accepts`}
            </button>
          </div>
        </div>

        {isComplete && (
          <div
            role="status"
            className="mt-4 border border-provider/40 bg-provider/10 px-4 py-3 text-center text-sm font-semibold text-provider"
          >
            Trade successful, matched!
          </div>
        )}

        <div className="absolute bottom-4 left-4 flex h-9 w-9 items-center justify-center border border-ink/30 text-muted sm:bottom-6 sm:left-6" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.8-3.1A7.5 7.5 0 1 1 20 11.5Z" />
            <path d="M8.5 11.5h7M8.5 14.5h4" />
          </svg>
        </div>
      </section>
    </div>
  )
}

function StreamForm({ side, onClose, onCreate }) {
  const [form, setForm] = useState({
    title: '',
    material: 'steel',
    qty: '',
    company: '',
    industry: 'Materials',
  })

  function submit(e) {
    e.preventDefault()
    if (!form.title || !form.qty || !form.company) return
    onCreate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-4 sm:items-center">
      <form
        onSubmit={submit}
        className="w-full max-w-md border border-ink/15 bg-paper p-6 shadow-[0_20px_60px_rgba(20,22,20,0.12)]"
      >
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold tracking-[-0.03em]">List a stream</h3>
          <button type="button" onClick={onClose} className="text-xs uppercase tracking-[0.16em] text-muted">
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          {side === 'have' ? 'You have surplus material to place.' : 'You need a material stream.'}
        </p>
        <label className="mt-5 block text-[11px] uppercase tracking-[0.14em] text-muted">
          Material name
          <input
            className="mt-1 w-full border-b border-ink/20 bg-transparent py-2 text-sm outline-none"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="mt-4 block text-[11px] uppercase tracking-[0.14em] text-muted">
          Category
          <select
            className="mt-1 w-full border-b border-ink/20 bg-transparent py-2 text-sm outline-none"
            value={form.material}
            onChange={(e) => setForm({ ...form, material: e.target.value })}
          >
            {MATERIALS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="mt-4 block text-[11px] uppercase tracking-[0.14em] text-muted">
          Quantity / day
          <input
            className="mt-1 w-full border-b border-ink/20 bg-transparent py-2 text-sm outline-none"
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value })}
            placeholder="e.g. 400 kg / day"
          />
        </label>
        <label className="mt-4 block text-[11px] uppercase tracking-[0.14em] text-muted">
          Company
          <input
            className="mt-1 w-full border-b border-ink/20 bg-transparent py-2 text-sm outline-none"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </label>
        <button
          type="submit"
          className="mt-6 w-full border border-ink py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] hover:bg-ink hover:text-paper"
        >
          Place on the network
        </button>
      </form>
    </div>
  )
}

export default function App() {
  const [progress, setProgress] = useState(0)
  const [side, setSide] = useState('have')
  const [mode, setMode] = useState('sell')
  const [selectedId, setSelectedId] = useState('polyloop')
  const [listings, setListings] = useState(INITIAL_LISTINGS)
  const [extraNodes, setExtraNodes] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [accepted, setAccepted] = useState({})
  const [activeTrade, setActiveTrade] = useState(null)
  const [stats, setStats] = useState({ streams: 12.4, saved: 8420, co2: 6240 })

  useEffect(() => {
    const onScroll = () => {
      const range = Math.max(window.innerHeight * 0.9, 1)
      setProgress(clamp(window.scrollY / range, 0, 1))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  function chooseSide(next) {
    setSide(next)
    setMode(next === 'have' ? 'sell' : 'buy')
  }

  function handleAccept(item) {
    if (accepted[item.id]) return
    setActiveTrade(item)
  }

  function handleTradeComplete() {
    if (!activeTrade || accepted[activeTrade.id]) return
    setAccepted((prev) => ({ ...prev, [activeTrade.id]: true }))
    setStats((s) => ({
      streams: Number((s.streams + 0.4).toFixed(1)),
      saved: s.saved + activeTrade.save,
      co2: s.co2 + Math.round(activeTrade.save * 1.4),
    }))
  }

  function handleCreate(form) {
    const id = `n-${Date.now()}`
    const listingId = `l-${Date.now()}`
    const lat = 12.93 + Math.random() * 0.07
    const lng = 77.54 + Math.random() * 0.1
    setExtraNodes((nodes) => [
      ...nodes,
      {
        id,
        lat,
        lng,
        type: side === 'have' ? 'provider' : 'buyer',
        name: form.company,
        material: form.material,
        note: `${side === 'have' ? 'Offers' : 'Needs'} ${form.title.toLowerCase()}`,
      },
    ])
    setListings((rows) => [
      {
        id: listingId,
        mode: side === 'have' ? 'buy' : 'sell',
        material: form.material,
        title: form.title,
        qty: form.qty.includes('/') ? form.qty : `${form.qty} / day`,
        company: form.company,
        nodeId: id,
        distance: Number((3 + Math.random() * 8).toFixed(1)),
        reliability: Number((4 + Math.random() * 0.8).toFixed(1)),
        save: Math.round(180 + Math.random() * 600),
        industry: 'Materials',
      },
      ...rows,
    ])
    setSelectedId(id)
    setFormOpen(false)
  }

  return (
    <div className="paper-grain bg-paper text-ink">
      <section className="relative z-10 flex min-h-screen flex-col overflow-hidden">
        <Header streams={stats.streams} saved={stats.saved} co2={stats.co2} />

        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0">
            <HeroNetwork />
          </div>

          <HeroCopy
            progress={progress}
            side={side}
            setSide={chooseSide}
            onListStream={() => setFormOpen(true)}
          />
        </div>
      </section>

      <section className="relative z-10 flex min-h-screen flex-col">
        <CompactSwitcher
          side={side}
          setSide={chooseSide}
          onListStream={() => setFormOpen(true)}
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(380px,1.15fr)]">
          <IndustrialMap
            selectedId={selectedId}
            onSelect={setSelectedId}
            extraNodes={extraNodes}
          />
          <Marketplace
            mode={mode}
            setMode={setMode}
            listings={listings}
            selectedId={selectedId}
            onSelect={setSelectedId}
            accepted={accepted}
            onAccept={handleAccept}
          />
        </div>

        <footer className="relative z-20 flex items-end justify-between gap-4 px-5 py-4 text-[10px] uppercase tracking-[0.14em] text-muted sm:px-8">
          <p className="hidden sm:block">
            <span className="mr-4">● Provider (has)</span>
            <span className="mr-4">○ Need (wants)</span>
            <span>— AI match</span>
          </p>
          <p className="ml-auto">The Amazon Marketplace for industrial waste.</p>
        </footer>
      </section>

      {formOpen && (
        <StreamForm side={side} onClose={() => setFormOpen(false)} onCreate={handleCreate} />
      )}
      {activeTrade && (
        <TradeModal
          key={activeTrade.id}
          item={activeTrade}
          onClose={() => setActiveTrade(null)}
          onComplete={handleTradeComplete}
        />
      )}
    </div>
  )
}

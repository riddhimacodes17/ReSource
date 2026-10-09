import { useEffect, useMemo, useState } from 'react'

const MATERIALS = ['steel', 'plastic', 'paper', 'glass', 'heat', 'water', 'CO₂', 'other']

const INITIAL_NODES = [
  { id: 'greenpack', x: 22, y: 26, type: 'buyer', name: 'GreenPack Industries', material: 'plastic', note: 'Needs plastic pellets' },
  { id: 'ecosteel', x: 40, y: 40, type: 'provider', name: 'EcoSteel Industries', material: 'steel', note: 'Offers scrap steel' },
  { id: 'polyloop', x: 48, y: 30, type: 'provider', name: 'PolyLoop Ltd', material: 'plastic', note: 'Offers plastic pellets' },
  { id: 'thermal', x: 62, y: 48, type: 'provider', name: 'Thermal Solutions Ltd', material: 'heat', note: 'Offers waste heat' },
  { id: 'printworks', x: 72, y: 24, type: 'buyer', name: 'PrintWorks Co', material: 'paper', note: 'Needs paper scrap' },
  { id: 'forge', x: 28, y: 62, type: 'provider', name: 'Forge & Form', material: 'glass', note: 'Offers glass cullet' },
  { id: 'aquacycle', x: 52, y: 68, type: 'provider', name: 'AquaCycle Industries', material: 'water', note: 'Offers process water' },
  { id: 'northmill', x: 68, y: 62, type: 'other', name: 'North Mill', material: 'other', note: 'Idle capacity' },
  { id: 'delta', x: 16, y: 48, type: 'other', name: 'Delta Plant', material: 'other', note: 'Observing' },
  { id: 'kiln', x: 78, y: 42, type: 'buyer', name: 'Kiln District', material: 'heat', note: 'Needs process heat' },
]

const CONNECTIONS = [
  { from: 'polyloop', to: 'greenpack', kind: 'active', match: 92, km: 4.2 },
  { from: 'ecosteel', to: 'forge', kind: 'potential' },
  { from: 'thermal', to: 'kiln', kind: 'potential' },
  { from: 'aquacycle', to: 'greenpack', kind: 'potential' },
  { from: 'printworks', to: 'northmill', kind: 'potential' },
  { from: 'delta', to: 'ecosteel', kind: 'potential' },
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

function nodeById(id) {
  return INITIAL_NODES.find((n) => n.id === id)
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

function MapNode({ node, selected, onSelect, zoom }) {
  const r = node.type === 'other' ? 5 : 7
  const selectedBoost = selected ? 1.25 : 1
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node.id)
      }}
    >
      {selected && (
        <circle r={18 / zoom} fill={node.type === 'buyer' ? '#3b6fd8' : '#2f7a3c'} opacity="0.12" />
      )}
      {node.type === 'provider' && (
        <>
          <circle r={(r + 6) / zoom} fill="#2f7a3c" opacity="0.18" className="node-halo" />
          <circle r={r / zoom} fill="#2f7a3c" />
        </>
      )}
      {node.type === 'buyer' && (
        <circle r={(r * selectedBoost) / zoom} fill="none" stroke="#3b6fd8" strokeWidth={2.2 / zoom} />
      )}
      {node.type === 'other' && (
        <circle r={r / zoom} fill="#9aa194" />
      )}
      {selected && (
        <g transform={`translate(${12 / zoom} ${-16 / zoom})`}>
          <rect x="0" y="-10" width="132" height="28" rx="2" fill="#f4f5f0" stroke="#c4c8be" />
          <text x="8" y="2" fontSize="8" fill="#141614" fontWeight="600">
            {node.name}
          </text>
          <text x="8" y="12" fontSize="7" fill="#6a6e66">
            {node.note}
          </text>
        </g>
      )}
    </g>
  )
}
//map fxn below(to be replaced)
function IndustrialMap({ selectedId, onSelect, extraNodes }) {
  const [zoom, setZoom] = useState(1)
  const nodes = [...INITIAL_NODES, ...extraNodes]

  const paths = CONNECTIONS.map((c) => {
    const a = nodeById(c.from)
    const b = nodeById(c.to)
    if (!a || !b) return null
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2 - 8
    return { ...c, d: `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}` }
  }).filter(Boolean)

  return (
    <div className="relative h-full min-h-[52vh] overflow-hidden border-r border-ink/10 bg-[#e4e7df] lg:min-h-0">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 text-[11px] text-muted">
        <span className="inline-block h-3 w-2.5 border border-ink/30" />
        Bengaluru industrial basin
      </div>

      <svg
        viewBox="0 0 100 100"
        className="h-full w-full cursor-grab"
        onClick={() => onSelect(null)}
        role="img"
        aria-label="Industrial network visualization"
      >
        <g transform={`translate(50 52) scale(${zoom}) translate(-50 -52)`}>
          <path d="M8 22 C22 10 40 14 52 8 C70 2 88 12 94 28 C98 46 88 62 90 80 C70 96 40 92 18 86 C4 70 2 42 8 22Z" fill="#d5d9ce" />
          <path d="M12 48 C24 44 30 58 42 54 C50 62 40 74 28 70 C16 66 8 58 12 48Z" fill="#cdd2c4" />
          <path d="M58 18 C70 16 82 22 86 34 C80 40 66 32 58 18Z" fill="#c9cec0" />
          <path d="M48 0 C50 28 46 54 52 100" fill="none" stroke="#c5d0d4" strokeWidth="2.4" opacity="0.9" />
          <path d="M0 36 C18 34 30 40 48 36" fill="none" stroke="#d7dcd3" strokeWidth="0.4" />
          <path d="M0 72 C22 68 40 76 70 70" fill="none" stroke="#d7dcd3" strokeWidth="0.4" />

          {paths.map((p) => (
            <path
              key={`${p.from}-${p.to}`}
              d={p.d}
              fill="none"
              stroke={p.kind === 'active' ? '#2f7a3c' : '#9aa194'}
              strokeWidth={p.kind === 'active' ? 0.55 : 0.28}
              strokeDasharray={p.kind === 'active' ? '1.4 1.1' : '0.7 0.9'}
              className={p.kind === 'active' ? 'network-flow' : undefined}
            />
          ))}

          {paths
            .filter((p) => p.kind === 'active')
            .map((p) => (
              <text key={`label-${p.from}`} x="34" y="24" fontSize="2.1" fill="#6a6e66" letterSpacing="0.18">
                MATCH · [{p.match}%] · [{p.km} km]
              </text>
            ))}

          {nodes.map((node) => (
            <MapNode
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              onSelect={onSelect}
              zoom={zoom}
            />
          ))}
        </g>
      </svg>

      <div className="absolute bottom-16 left-4 z-10 space-y-1 text-[10px] uppercase tracking-[0.14em] text-muted">
        <p className="flex items-center gap-2">
          <span className="h-px w-6 bg-provider" /> Active match
        </p>
        <p className="flex items-center gap-2">
          <span className="h-px w-6 border-t border-dashed border-muted" /> Potential match
        </p>
        <p className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-provider" /> Factory (seller)
        </p>
        <p className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-buyer" /> Factory (buyer)
        </p>
        <p className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#9aa194]" /> Other company
        </p>
      </div>

      <div className="absolute bottom-4 right-4 z-10 flex overflow-hidden border border-ink/20 bg-paper/80">
        <button
          type="button"
          className="px-3 py-1.5 text-sm hover:bg-ink hover:text-paper"
          onClick={() => setZoom((z) => clamp(Number((z + 0.15).toFixed(2)), 0.7, 1.8))}
        >
          +
        </button>
        <button
          type="button"
          className="border-l border-ink/20 px-3 py-1.5 text-sm hover:bg-ink hover:text-paper"
          onClick={() => setZoom((z) => clamp(Number((z - 0.15).toFixed(2)), 0.7, 1.8))}
        >
          −
        </button>
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
                  {isAccepted ? 'Matched' : 'Accept match'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
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
    setAccepted((prev) => ({ ...prev, [item.id]: true }))
    setStats((s) => ({
      streams: Number((s.streams + 0.4).toFixed(1)),
      saved: s.saved + item.save,
      co2: s.co2 + Math.round(item.save * 1.4),
    }))
  }

  function handleCreate(form) {
    const id = `n-${Date.now()}`
    const listingId = `l-${Date.now()}`
    const x = 20 + Math.random() * 60
    const y = 20 + Math.random() * 60
    setExtraNodes((nodes) => [
      ...nodes,
      {
        id,
        x,
        y,
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
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
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
    </div>
  )
}

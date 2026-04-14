import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getInventory, getExpiringInventory, createInventory, deleteInventory, updateInventoryStatus, updateInventory, getFoods, createConsumption, bulkInventoryStatus } from '../api/client'

type InventoryItem = {
  id: number; food_item_id: number; quantity: number; quantity_remaining: number | null;
  unit: string; purchase_date?: string; expiry_date?: string; notes?: string;
  status: string; discard_reason?: string; consumed_date?: string;
  food_name?: string; food_brand?: string;
  calories_per_100g?: number; protein_per_100g?: number;
  carbs_per_100g?: number; fat_per_100g?: number;
  location?: string; serving_size_g?: number;
}
type FoodItem = { id: number; name: string; brand?: string }

const LOCATION_BADGE: Record<string, string> = {
  fridge: '🧊 Fridge',
  freezer: '❄️ Freezer',
  pantry: '🥡 Pantry',
  other: '📦 Other',
}

function SetLocationModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const qc = useQueryClient()
  const [loc, setLoc] = useState(item.location ?? 'pantry')
  const mut = useMutation({
    mutationFn: () => updateInventory(item.id, { location: loc }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); onClose() },
  })
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-5 space-y-4">
        <h2 className="font-semibold">Set Location: {item.food_name}</h2>
        <select value={loc} onChange={e => setLoc(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="fridge">🧊 Fridge</option>
          <option value="freezer">❄️ Freezer</option>
          <option value="pantry">🥡 Pantry</option>
          <option value="other">📦 Other</option>
        </select>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="flex-1 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">Save</button>
        </div>
      </div>
    </div>
  )
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function ExpiryBadge({ dateStr }: { dateStr: string }) {
  const days = daysUntil(dateStr)
  if (days < 0) return <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Expired {Math.abs(days)}d ago</span>
  if (days === 0) return <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Expires today!</span>
  if (days <= 2) return <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Expires in {days}d</span>
  if (days <= 7) return <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Expires in {days}d</span>
  return <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{dateStr.slice(0,10)}</span>
}

function DiscardModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('expired')
  const mut = useMutation({
    mutationFn: () => updateInventoryStatus(item.id, { status: 'discarded', discard_reason: reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['expiring'] }); onClose() },
  })
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Discard: {item.food_name}</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Reason</label>
          <select value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="expired">Gone bad / Expired</option>
            <option value="overcooked">Overcooked</option>
            <option value="wastage">Accidental wastage</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
            Confirm Discard
          </button>
        </div>
      </div>
    </div>
  )
}

function ConsumeModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const qc = useQueryClient()
  const current = item.quantity_remaining ?? item.quantity
  const [amount, setAmount] = useState(String(current))
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10))
  const [split, setSplit] = useState<'daniel' | 'thirza' | 'other' | 'both'>('daniel')
  const [danielPct, setDanielPct] = useState(50)
  const remaining = current - parseFloat(amount || '0')

  const mut = useMutation({
    mutationFn: async () => {
      const consumed = parseFloat(amount || '0')
      const consumedAt = new Date(dateStr).toISOString()
      // Build consumption log entries
      const entries: object[] = []
      if (split === 'both') {
        const danielAmt = Math.round(consumed * danielPct / 100 * 100) / 100
        const thirzaAmt = Math.round((consumed - danielAmt) * 100) / 100
        if (danielAmt > 0) entries.push({ inventory_item_id: item.id, person: 'daniel', amount: danielAmt, unit: item.unit, consumed_at: consumedAt })
        if (thirzaAmt > 0) entries.push({ inventory_item_id: item.id, person: 'thirza', amount: thirzaAmt, unit: item.unit, consumed_at: consumedAt })
      } else {
        entries.push({ inventory_item_id: item.id, person: split, amount: consumed, unit: item.unit, consumed_at: consumedAt })
      }
      // Log to diary
      if (entries.length > 0) await createConsumption(entries)
      // Update inventory status
      await updateInventoryStatus(item.id, {
        status: remaining <= 0 ? 'consumed' : 'in_stock',
        quantity_remaining: Math.max(0, remaining),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['expiring'] })
      qc.invalidateQueries({ queryKey: ['consumption'] })
      qc.invalidateQueries({ queryKey: ['consumption-summary'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Log consumption: {item.food_name}</h2>
        <p className="text-sm text-gray-500">Available: {current} {item.unit}</p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Amount consumed ({item.unit})</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" max={current} step="0.1"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date consumed</label>
          <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-2">Who ate it?</label>
          <div className="flex gap-2">
            {(['daniel', 'thirza', 'both', 'other'] as const).map(p => (
              <button key={p} onClick={() => setSplit(p)}
                className={`flex-1 py-1.5 text-xs rounded-lg border ${split === p ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {p === 'daniel' ? '🦁 Daniel' : p === 'thirza' ? '🌸 Thirza' : p === 'both' ? '👫 Both' : '👤 Other'}
              </button>
            ))}
          </div>
        </div>
        {split === 'both' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Daniel's share: {danielPct}% / Thirza: {100 - danielPct}%</label>
            <input type="range" min="0" max="100" value={danielPct} onChange={e => setDanielPct(Number(e.target.value))}
              className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Daniel: {(parseFloat(amount||'0') * danielPct / 100).toFixed(1)} {item.unit}</span>
              <span>Thirza: {(parseFloat(amount||'0') * (100 - danielPct) / 100).toFixed(1)} {item.unit}</span>
            </div>
          </div>
        )}
        {remaining > 0 && <p className="text-sm text-gray-400">Remaining: {remaining.toFixed(1)} {item.unit}</p>}
        {remaining <= 0 && <p className="text-sm text-green-600">Item will be fully consumed.</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !amount || parseFloat(amount) <= 0}
            className="flex-1 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Log'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddItemModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('piece')
  const [expiryDate, setExpiryDate] = useState('')
  const [location, setLocation] = useState('pantry')

  const { data: foods } = useQuery<FoodItem[]>({
    queryKey: ['foods', q],
    queryFn: () => getFoods(q).then(r => r.data),
  })

  const addMutation = useMutation({
    mutationFn: () => createInventory({
      food_item_id: selectedFood!.id,
      quantity: parseFloat(quantity),
      unit,
      expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
      location,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['expiring'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Add to Inventory</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        {!selectedFood ? (
          <>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search food catalog…"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div className="max-h-64 overflow-y-auto divide-y">
              {(foods || []).map(f => (
                <button key={f.id} onClick={() => setSelectedFood(f)}
                  className="w-full text-left px-2 py-2 hover:bg-gray-50 text-sm">
                  {f.name} {f.brand && <span className="text-gray-400">({f.brand})</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm"><span className="font-medium">Selected:</span> {selectedFood.name}</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unit</label>
                <select value={unit} onChange={e => setUnit(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="piece">piece</option>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Expiry Date (optional)</label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Location</label>
              <select value={location} onChange={e => setLocation(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="fridge">🧊 Fridge</option>
                <option value="freezer">❄️ Freezer</option>
                <option value="pantry">🥡 Pantry</option>
                <option value="other">📦 Other</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setSelectedFood(null)} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Back</button>
              <button onClick={() => addMutation.mutate()}
                disabled={!quantity || addMutation.isPending}
                className="flex-1 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SetExpiryModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(item.expiry_date?.slice(0,10) ?? '')
  const mut = useMutation({
    mutationFn: () => updateInventory(item.id, { expiry_date: date ? new Date(date).toISOString() : null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['expiring'] }); onClose() },
  })
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Set Expiry: {item.food_name}</h2>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Inventory() {
  const [showAdd, setShowAdd] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [discardTarget, setDiscardTarget] = useState<InventoryItem | null>(null)
  const [consumeTarget, setConsumeTarget] = useState<InventoryItem | null>(null)
  const [expiryTarget, setExpiryTarget] = useState<InventoryItem | null>(null)
  const [locationTarget, setLocationTarget] = useState<InventoryItem | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const qc = useQueryClient()

  const toggleSelect = (id: number) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const { data: items, isLoading } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', showAll],
    queryFn: () => getInventory(showAll).then(r => r.data),
  })

  const { data: expiring } = useQuery<InventoryItem[]>({
    queryKey: ['expiring'],
    queryFn: () => getExpiringInventory(14).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteInventory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['expiring'] }) },
  })

  const bulkConsumeMut = useMutation({
    mutationFn: () => bulkInventoryStatus(Array.from(selected), 'consumed'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setSelected(new Set()) },
  })

  const bulkDiscardMut = useMutation({
    mutationFn: () => bulkInventoryStatus(Array.from(selected), 'discarded', 'bulk_discard'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setSelected(new Set()) },
  })

  const inStock = items?.filter(i => i.status === 'in_stock') ?? []
  const consumed = items?.filter(i => i.status === 'consumed') ?? []
  const discarded = items?.filter(i => i.status === 'discarded') ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowAll(a => !a)}
            className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
            {showAll ? 'Hide consumed' : 'Show all'}
          </button>
          <button onClick={() => setShowAdd(true)}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600">
            + Add Item
          </button>
        </div>
      </div>

      {/* Bulk selection bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
          <span className="text-sm font-medium text-indigo-700">{selected.size} selected</span>
          <button onClick={() => bulkConsumeMut.mutate()} disabled={bulkConsumeMut.isPending} className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600">Mark All Eaten</button>
          <button onClick={() => bulkDiscardMut.mutate()} disabled={bulkDiscardMut.isPending} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600">Discard All</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700 ml-auto">Clear selection</button>
        </div>
      )}

      {/* Expiring soon panel */}
      {expiring && expiring.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h2 className="font-semibold text-amber-800 mb-3">⚠ Expiring Soon ({expiring.length})</h2>
          <div className="space-y-2">
            {expiring.map(item => (
              <div key={item.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.food_name}</span>
                  {item.food_brand && <span className="text-gray-400 text-xs">({item.food_brand})</span>}
                  <span className="text-gray-500">{item.quantity_remaining ?? item.quantity} {item.unit}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.expiry_date && <ExpiryBadge dateStr={item.expiry_date} />}
                  <button onClick={() => setConsumeTarget(item)} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Eaten</button>
                  <button onClick={() => setDiscardTarget(item)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">Discard</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? <p className="text-gray-400">Loading…</p> : (
        <>
          {/* In Stock */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h2 className="font-semibold text-gray-700">In Stock ({inStock.length})</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(inStock.map(i => i.id)) : new Set())}
                      checked={inStock.length > 0 && selected.size === inStock.length}
                      className="w-4 h-4 rounded accent-brand-500 cursor-pointer" />
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Food</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Remaining</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Purchased</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Expiry</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inStock.map(item => {
                  const remaining = item.quantity_remaining ?? item.quantity
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${selected.has(item.id) ? 'bg-indigo-50' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded accent-brand-500 cursor-pointer" />
                      </td>
                      <td className="px-3 py-2">
                        {item.location ? (
                          <button onClick={() => setLocationTarget(item)}
                            className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full hover:bg-gray-200 whitespace-nowrap">
                            {LOCATION_BADGE[item.location] ?? item.location}
                          </button>
                        ) : (
                          <button onClick={() => setLocationTarget(item)}
                            className="text-xs text-gray-300 hover:text-brand-500">+ loc</button>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{item.food_name ?? `Food #${item.food_item_id}`}</div>
                        {item.food_brand && <div className="text-xs text-gray-400">{item.food_brand}</div>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div>{remaining} {item.unit}</div>
                        {item.quantity_remaining !== null && item.quantity_remaining !== item.quantity && (
                          <div className="text-xs text-gray-400">of {item.quantity}</div>
                        )}
                        {item.serving_size_g && (
                          <div className="text-xs text-gray-400">
                            {item.serving_size_g}g × {remaining} = {Math.round(item.serving_size_g * remaining)}g
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{item.purchase_date?.slice(0,10) ?? '—'}</td>
                      <td className="px-4 py-2">
                        {item.expiry_date
                          ? <ExpiryBadge dateStr={item.expiry_date} />
                          : item.location === 'fridge'
                            ? <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full cursor-pointer" onClick={() => setExpiryTarget(item)}>⚠ Add expiry</span>
                            : <button onClick={() => setExpiryTarget(item)} className="text-xs text-gray-300 hover:text-brand-500">+ expiry</button>
                        }
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setConsumeTarget(item)} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Eaten</button>
                          <button onClick={() => setDiscardTarget(item)} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200">Discard</button>
                          <button onClick={() => deleteMutation.mutate(item.id)} className="text-xs text-gray-300 hover:text-red-500 px-1 py-1 rounded">🗑</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {inStock.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No items in stock.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Consumed */}
          {showAll && consumed.length > 0 && (
            <div className="bg-white rounded-xl shadow overflow-hidden opacity-75">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h2 className="font-semibold text-gray-500">Consumed ({consumed.length})</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {consumed.map(item => (
                    <tr key={item.id} className="text-gray-400">
                      <td className="px-4 py-2">{item.food_name}</td>
                      <td className="px-4 py-2">{item.quantity} {item.unit}</td>
                      <td className="px-4 py-2">{item.consumed_date?.slice(0,10) ?? '—'}</td>
                      <td className="px-4 py-2 text-right"><button onClick={() => deleteMutation.mutate(item.id)} className="text-xs hover:text-red-500">🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Discarded */}
          {showAll && discarded.length > 0 && (
            <div className="bg-white rounded-xl shadow overflow-hidden opacity-75">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h2 className="font-semibold text-gray-500">Discarded ({discarded.length})</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {discarded.map(item => (
                    <tr key={item.id} className="text-gray-400">
                      <td className="px-4 py-2">{item.food_name}</td>
                      <td className="px-4 py-2">{item.quantity} {item.unit}</td>
                      <td className="px-4 py-2 text-red-400 text-xs">{item.discard_reason ?? '—'}</td>
                      <td className="px-4 py-2 text-right"><button onClick={() => deleteMutation.mutate(item.id)} className="text-xs hover:text-red-500">🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} />}
      {discardTarget && <DiscardModal item={discardTarget} onClose={() => setDiscardTarget(null)} />}
      {consumeTarget && <ConsumeModal item={consumeTarget} onClose={() => setConsumeTarget(null)} />}
      {expiryTarget && <SetExpiryModal item={expiryTarget} onClose={() => setExpiryTarget(null)} />}
      {locationTarget && <SetLocationModal item={locationTarget} onClose={() => setLocationTarget(null)} />}
    </div>
  )
}

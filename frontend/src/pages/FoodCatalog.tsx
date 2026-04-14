import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFoods, createFood, updateFood, deleteFood, searchOFF } from '../api/client'

type FoodItem = {
  id: number; name: string; brand?: string; barcode?: string;
  calories_per_100g?: number; protein_per_100g?: number;
  carbs_per_100g?: number; fat_per_100g?: number;
  fiber_per_100g?: number; sugar_per_100g?: number;
  sodium_per_100g?: number; serving_size_g?: number; unit?: string; source?: string;
}

const emptyForm = {
  name: '', brand: '', barcode: '', off_id: '',
  calories_per_100g: '', protein_per_100g: '', carbs_per_100g: '',
  fat_per_100g: '', fiber_per_100g: '', sugar_per_100g: '', sodium_per_100g: '',
  serving_size_g: '',
  unit: 'g', source: 'manual',
}

function toNum(v: string) { const n = parseFloat(v); return isNaN(n) ? undefined : n }

function FoodForm({
  initial, onSubmit, onCancel, submitLabel
}: {
  initial?: Partial<typeof emptyForm>
  onSubmit: (data: object) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [form, setForm] = useState({ ...emptyForm, ...initial })
  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name: form.name, brand: form.brand || undefined, barcode: form.barcode || undefined,
      off_id: form.off_id || undefined,
      calories_per_100g: toNum(form.calories_per_100g),
      protein_per_100g: toNum(form.protein_per_100g),
      carbs_per_100g: toNum(form.carbs_per_100g),
      fat_per_100g: toNum(form.fat_per_100g),
      fiber_per_100g: toNum(form.fiber_per_100g),
      sugar_per_100g: toNum(form.sugar_per_100g),
      sodium_per_100g: toNum(form.sodium_per_100g),
      serving_size_g: toNum(form.serving_size_g),
      unit: form.unit, source: form.source,
    })
  }

  const inp = 'w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={lbl}>Name *</label>
          <input required value={form.name} onChange={f('name')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Brand</label>
          <input value={form.brand} onChange={f('brand')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Barcode</label>
          <input value={form.barcode} onChange={f('barcode')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Calories /100g</label>
          <input type="number" step="0.1" value={form.calories_per_100g} onChange={f('calories_per_100g')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Protein /100g</label>
          <input type="number" step="0.1" value={form.protein_per_100g} onChange={f('protein_per_100g')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Carbs /100g</label>
          <input type="number" step="0.1" value={form.carbs_per_100g} onChange={f('carbs_per_100g')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Fat /100g</label>
          <input type="number" step="0.1" value={form.fat_per_100g} onChange={f('fat_per_100g')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Fiber /100g</label>
          <input type="number" step="0.1" value={form.fiber_per_100g} onChange={f('fiber_per_100g')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Package weight/vol (g or ml)</label>
          <input type="number" step="1" value={form.serving_size_g} onChange={f('serving_size_g')} className={inp} placeholder="e.g. 400" />
        </div>
        <div>
          <label className={lbl}>Unit</label>
          <select value={form.unit} onChange={f('unit')} className={inp}>
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="piece">piece</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
        <button type="submit" className="flex-1 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">{submitLabel}</button>
      </div>
    </form>
  )
}

function AddFoodModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'manual' | 'off'>('manual')
  const [q, setQ] = useState('')
  const [offResults, setOffResults] = useState<FoodItem[]>([])
  const [searching, setSearching] = useState(false)
  const [prefill, setPrefill] = useState<Partial<typeof emptyForm> | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: object) => createFood(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['foods'] }); onClose() },
  })

  const searchOff = async () => {
    if (!q) return
    setSearching(true)
    try { setOffResults((await searchOFF(q)).data) }
    finally { setSearching(false) }
  }

  if (prefill) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 overflow-y-auto max-h-screen">
          <h2 className="text-lg font-semibold mb-4">Confirm & Save</h2>
          <FoodForm initial={prefill} onSubmit={d => createMutation.mutate(d)} onCancel={() => setPrefill(null)} submitLabel="Save Food" />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 overflow-y-auto max-h-screen">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Add Food Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('manual')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'manual' ? 'bg-brand-500 text-white' : 'bg-gray-100'}`}>Manual</button>
          <button onClick={() => setTab('off')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'off' ? 'bg-brand-500 text-white' : 'bg-gray-100'}`}>Open Food Facts</button>
        </div>
        {tab === 'manual' ? (
          <FoodForm onSubmit={d => createMutation.mutate(d)} onCancel={onClose} submitLabel="Create" />
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Open Food Facts…"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                onKeyDown={e => e.key === 'Enter' && searchOff()} />
              <button onClick={searchOff} disabled={searching}
                className="bg-gray-100 px-3 py-2 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50">
                {searching ? '…' : 'Search'}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {offResults.map((f, i) => (
                <button key={i} onClick={() => setPrefill({
                  name: f.name ?? '', brand: f.brand ?? '', barcode: f.barcode ?? '',
                  calories_per_100g: String(f.calories_per_100g ?? ''),
                  protein_per_100g: String(f.protein_per_100g ?? ''),
                  carbs_per_100g: String(f.carbs_per_100g ?? ''),
                  fat_per_100g: String(f.fat_per_100g ?? ''),
                  fiber_per_100g: String(f.fiber_per_100g ?? ''),
                  source: 'open_food_facts',
                })}
                  className="w-full text-left px-2 py-2 hover:bg-gray-50 text-sm">
                  <div className="font-medium">{f.name}</div>
                  <div className="text-gray-400 text-xs">{f.brand} · {f.calories_per_100g} kcal/100g</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EditModal({ food, onClose }: { food: FoodItem; onClose: () => void }) {
  const qc = useQueryClient()
  const updateMutation = useMutation({
    mutationFn: (data: object) => updateFood(food.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['foods'] }); onClose() },
  })
  const initial = {
    name: food.name ?? '', brand: food.brand ?? '', barcode: food.barcode ?? '',
    calories_per_100g: String(food.calories_per_100g ?? ''),
    protein_per_100g: String(food.protein_per_100g ?? ''),
    carbs_per_100g: String(food.carbs_per_100g ?? ''),
    fat_per_100g: String(food.fat_per_100g ?? ''),
    fiber_per_100g: String(food.fiber_per_100g ?? ''),
    serving_size_g: String(food.serving_size_g ?? ''),
    unit: food.unit ?? 'g', source: food.source ?? 'manual',
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 overflow-y-auto max-h-screen">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Edit Food</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <FoodForm initial={initial} onSubmit={d => updateMutation.mutate(d)} onCancel={onClose} submitLabel="Save" />
      </div>
    </div>
  )
}

export default function FoodCatalog() {
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<FoodItem | null>(null)
  const [barcode, setBarcode] = useState('')
  const [barcodeResults, setBarcodeResults] = useState<FoodItem[]>([])
  const [barcodeSearching, setBarcodeSearching] = useState(false)
  const qc = useQueryClient()

  const { data: foods, isLoading } = useQuery<FoodItem[]>({
    queryKey: ['foods', search],
    queryFn: () => getFoods(search || undefined).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFood(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
  })

  const handleBarcodeSearch = async () => {
    if (!barcode) return
    setBarcodeSearching(true)
    try {
      const res = await searchOFF(barcode)
      setBarcodeResults(res.data)
    } finally { setBarcodeSearching(false) }
  }

  const importBarcodeItem = async (f: FoodItem) => {
    await createFood({
      name: f.name ?? '', brand: f.brand ?? '', barcode: f.barcode ?? '',
      calories_per_100g: f.calories_per_100g, protein_per_100g: f.protein_per_100g,
      carbs_per_100g: f.carbs_per_100g, fat_per_100g: f.fat_per_100g,
      fiber_per_100g: f.fiber_per_100g, source: 'open_food_facts',
    })
    qc.invalidateQueries({ queryKey: ['foods'] })
    setBarcodeResults([])
    setBarcode('')
  }

  return (
    <div className="space-y-6">
      {/* Barcode Scanner */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold text-gray-700 mb-2">🔍 Barcode Scanner</h2>
        <div className="flex gap-2">
          <input
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleBarcodeSearch()}
            placeholder="Enter barcode number…"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button onClick={handleBarcodeSearch} disabled={!barcode || barcodeSearching}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50">
            {barcodeSearching ? '…' : 'Search'}
          </button>
        </div>
        {barcodeResults.length > 0 && (
          <div className="mt-2 divide-y border rounded-lg overflow-hidden">
            {barcodeResults.slice(0, 5).map((f, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm bg-white hover:bg-gray-50">
                <div>
                  <div className="font-medium">{f.name || 'Unknown'}</div>
                  <div className="text-xs text-gray-400">{f.brand} · {f.calories_per_100g} kcal/100g</div>
                </div>
                <button onClick={() => importBarcodeItem(f)} className="text-xs bg-brand-500 text-white px-2 py-1 rounded hover:bg-brand-600">Import</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Food Catalog</h1>
        <div className="flex gap-2 flex-1 max-w-sm">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search foods…"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={() => setShowAdd(true)}
          className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 shrink-0">
          + Add Food
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Brand</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Pkg (g/ml)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">kcal</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">P(g)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">C(g)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">F(g)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {foods?.map(f => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{f.name}</td>
                  <td className="px-4 py-2 text-gray-500">{f.brand ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{f.serving_size_g ? `${f.serving_size_g}` : '—'}</td>
                  <td className="px-4 py-2 text-right">{f.calories_per_100g ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{f.protein_per_100g ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{f.carbs_per_100g ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{f.fat_per_100g ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs capitalize">{f.source}</td>
                  <td className="px-4 py-2 text-right flex gap-1 justify-end">
                    <button onClick={() => setEditItem(f)}
                      className="text-blue-400 hover:text-blue-600 text-xs px-2 py-1 rounded">Edit</button>
                    <button onClick={() => deleteMutation.mutate(f.id)}
                      className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded">Delete</button>
                  </td>
                </tr>
              ))}
              {foods?.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">No foods found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddFoodModal onClose={() => setShowAdd(false)} />}
      {editItem && <EditModal food={editItem} onClose={() => setEditItem(null)} />}
    </div>
  )
}

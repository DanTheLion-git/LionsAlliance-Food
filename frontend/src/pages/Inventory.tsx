import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getInventory, createInventory, deleteInventory, getFoods } from '../api/client'

type InventoryItem = {
  id: number; food_item_id: number; quantity: number; unit: string;
  purchase_date?: string; expiry_date?: string; notes?: string;
  food_name?: string; food_brand?: string;
  calories_per_100g?: number; protein_per_100g?: number;
  carbs_per_100g?: number; fat_per_100g?: number;
}
type FoodItem = { id: number; name: string; brand?: string }

function AddItemModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('g')

  const { data: foods } = useQuery<FoodItem[]>({
    queryKey: ['foods', q],
    queryFn: () => getFoods(q).then(r => r.data),
  })

  const addMutation = useMutation({
    mutationFn: () => createInventory({ food_item_id: selectedFood!.id, quantity: parseFloat(quantity), unit }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); onClose() },
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
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="piece">piece</option>
                  <option value="kg">kg</option>
                </select>
              </div>
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

export default function Inventory() {
  const [showAdd, setShowAdd] = useState(false)
  const qc = useQueryClient()

  const { data: items, isLoading } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: () => getInventory().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteInventory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
        <button onClick={() => setShowAdd(true)}
          className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600">
          + Add Item
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Food</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Brand</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Unit</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Purchased</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items?.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{item.food_name ?? `Food #${item.food_item_id}`}</td>
                  <td className="px-4 py-2 text-gray-500">{item.food_brand ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{item.quantity}</td>
                  <td className="px-4 py-2 text-gray-500">{item.unit}</td>
                  <td className="px-4 py-2 text-gray-400">{item.purchase_date?.slice(0, 10) ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => deleteMutation.mutate(item.id)}
                      className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {items?.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No inventory items yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

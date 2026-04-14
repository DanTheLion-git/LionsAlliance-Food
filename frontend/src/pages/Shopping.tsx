import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShopping, createShoppingItem, updateShoppingItem, deleteShoppingItem, clearCheckedShopping } from '../api/client'

type ShoppingItem = { id: number; name: string; quantity: number; unit: string; checked: boolean; notes?: string }

export default function Shopping() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newUnit, setNewUnit] = useState('piece')

  const { data: items } = useQuery<ShoppingItem[]>({
    queryKey: ['shopping'],
    queryFn: () => getShopping().then(r => r.data),
  })

  const addMut = useMutation({
    mutationFn: () => createShoppingItem({ name: newName, quantity: parseFloat(newQty), unit: newUnit }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shopping'] }); setNewName('') },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) => updateShoppingItem(id, { checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteShoppingItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })

  const clearMut = useMutation({
    mutationFn: () => clearCheckedShopping(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })

  const unchecked = (items ?? []).filter(i => !i.checked)
  const checked = (items ?? []).filter(i => i.checked)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Shopping List</h1>
        {checked.length > 0 && (
          <button onClick={() => clearMut.mutate()} className="text-sm text-red-400 hover:text-red-600">
            Clear {checked.length} checked
          </button>
        )}
      </div>

      {/* Add item */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold text-gray-700 mb-3">Add Item</h2>
        <div className="flex gap-2 flex-wrap">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newName && addMut.mutate()}
            placeholder="Item name…"
            className="flex-1 min-w-32 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <input type="number" value={newQty} onChange={e => setNewQty(e.target.value)}
            className="w-16 border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <select value={newUnit} onChange={e => setNewUnit(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none">
            <option value="piece">piece</option>
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="L">L</option>
            <option value="ml">ml</option>
          </select>
          <button onClick={() => newName && addMut.mutate()} disabled={!newName || addMut.isPending}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-600 disabled:opacity-50">
            + Add
          </button>
        </div>
      </div>

      {/* To buy */}
      {unchecked.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700">To Buy ({unchecked.length})</div>
          <div className="divide-y">
            {unchecked.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={false}
                  onChange={() => toggleMut.mutate({ id: item.id, checked: true })}
                  className="w-5 h-5 rounded accent-brand-500 cursor-pointer" />
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                <span className="text-xs text-gray-400">{item.quantity} {item.unit}</span>
                <button onClick={() => deleteMut.mutate(item.id)} className="text-gray-300 hover:text-red-500 text-xs">🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done */}
      {checked.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden opacity-60">
          <div className="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-500">Done ({checked.length})</div>
          <div className="divide-y">
            {checked.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={true}
                  onChange={() => toggleMut.mutate({ id: item.id, checked: false })}
                  className="w-5 h-5 rounded accent-brand-500 cursor-pointer" />
                <span className="flex-1 text-sm line-through text-gray-400">{item.name}</span>
                <span className="text-xs text-gray-400">{item.quantity} {item.unit}</span>
                <button onClick={() => deleteMut.mutate(item.id)} className="text-gray-300 hover:text-red-500 text-xs">🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!items || items.length === 0) && (
        <p className="text-gray-400 text-sm">Shopping list is empty. Add some items above!</p>
      )}
    </div>
  )
}

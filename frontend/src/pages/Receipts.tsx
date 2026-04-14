import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getReceipts, uploadReceipt, getReceipt,
  linkReceiptItem, addReceiptItemToInventory,
  deleteReceiptItem, deleteReceipt,
  getFoods, createFood, searchOFF, applyAllMappings
} from '../api/client'

type ReceiptSummary = {
  id: number; store: string; filename: string;
  upload_date: string; purchase_date?: string; parsed: boolean; item_count: number
}
type ReceiptDetail = {
  id: number; store: string; filename: string; upload_date: string;
  items: Array<{
    id: number; raw_name: string; price: number | null; quantity: number;
    parsed_weight_g: number | null; reviewed: boolean; food_item_id: number | null;
    food?: { id: number; name: string; brand: string; calories_per_100g: number; serving_size_g: number | null } | null
  }>
}
type FoodItem = { id: number; name: string; brand: string; calories_per_100g: number }

function LinkModal({
  receiptId, itemId, onClose
}: { receiptId: number; itemId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'catalog' | 'off'>('catalog')
  const [q, setQ] = useState('')
  const [offResults, setOffResults] = useState<FoodItem[]>([])
  const [searching, setSearching] = useState(false)

  const { data: foods } = useQuery({
    queryKey: ['foods', q],
    queryFn: () => getFoods(q).then(r => r.data),
  })

  const linkMutation = useMutation({
    mutationFn: (foodItemId: number) => linkReceiptItem(receiptId, itemId, foodItemId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['receipt', receiptId] }); onClose() },
  })

  const importAndLink = useMutation({
    mutationFn: async (offItem: object) => {
      const created = await createFood(offItem)
      await linkReceiptItem(receiptId, itemId, created.data.id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['receipt', receiptId] }); onClose() },
  })

  const searchOff = async () => {
    if (!q) return
    setSearching(true)
    try {
      const res = await searchOFF(q)
      setOffResults(res.data)
    } finally { setSearching(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Link to Food Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('catalog')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'catalog' ? 'bg-brand-500 text-white' : 'bg-gray-100'}`}>Food Catalog</button>
          <button onClick={() => setTab('off')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'off' ? 'bg-brand-500 text-white' : 'bg-gray-100'}`}>Open Food Facts</button>
        </div>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {tab === 'off' && (
          <button onClick={searchOff} disabled={searching} className="w-full mb-2 py-1.5 bg-gray-100 rounded-lg text-sm">
            {searching ? 'Searching…' : 'Search Open Food Facts'}
          </button>
        )}
        <div className="max-h-64 overflow-y-auto divide-y">
          {tab === 'catalog' && (foods as FoodItem[] || []).map((f) => (
            <button key={f.id} onClick={() => linkMutation.mutate(f.id)}
              className="w-full text-left px-2 py-2 hover:bg-gray-50 text-sm flex justify-between">
              <span>{f.name} {f.brand && <span className="text-gray-400">({f.brand})</span>}</span>
              <span className="text-gray-400">{f.calories_per_100g} kcal</span>
            </button>
          ))}
          {tab === 'off' && offResults.map((f, i) => (
            <button key={i} onClick={() => importAndLink.mutate(f)}
              className="w-full text-left px-2 py-2 hover:bg-gray-50 text-sm flex justify-between">
              <span>{f.name} {f.brand && <span className="text-gray-400">({f.brand})</span>}</span>
              <span className="text-gray-400">{f.calories_per_100g} kcal</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReceiptRow({ receipt }: { receipt: ReceiptSummary }) {
  const [expanded, setExpanded] = useState(false)
  const [linkTarget, setLinkTarget] = useState<number | null>(null)
  const qc = useQueryClient()

  const { data: detail } = useQuery<ReceiptDetail>({
    queryKey: ['receipt', receipt.id],
    queryFn: () => getReceipt(receipt.id).then(r => r.data),
    enabled: expanded,
  })

  const addToInv = useMutation({
    mutationFn: ({ itemId, qty, unit }: { itemId: number; qty: number; unit: string }) =>
      addReceiptItemToInventory(receipt.id, itemId, { quantity: qty, unit }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })

  const deleteItem = useMutation({
    mutationFn: (itemId: number) => deleteReceiptItem(receipt.id, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receipt', receipt.id] }),
  })

  const deleteThisReceipt = useMutation({
    mutationFn: () => deleteReceipt(receipt.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receipts'] }),
  })

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left">
        <div className="flex items-center gap-3">
          <span className="font-semibold capitalize">{receipt.store}</span>
          <span className="text-gray-400 text-sm">{(receipt.purchase_date || receipt.upload_date)?.slice(0, 10)}</span>
          <span className="text-gray-500 text-sm">{receipt.item_count} items</span>
          {receipt.parsed && <span className="text-green-600 text-xs bg-green-50 px-2 py-0.5 rounded-full">Parsed</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); if (confirm('Delete this receipt and its parsed lines?\n\nInventory items added from this receipt will be KEPT.')) deleteThisReceipt.mutate() }}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">
            🗑
          </button>
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && detail && (
        <div className="border-t divide-y">
          {detail.items.map(item => (
            <div key={item.id} className={`px-4 py-2 flex items-center justify-between text-sm ${!item.food_item_id ? 'bg-orange-50' : ''}`}>
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                <span className={item.food ? 'text-gray-800' : 'text-gray-500 italic'}>{item.raw_name}</span>
                {item.food && <span className="text-green-700 text-xs">→ {item.food.name}</span>}
                {/* Quantity badge */}
                {item.quantity > 1 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">×{item.quantity}</span>
                )}
                {/* Weight badge */}
                {item.parsed_weight_g != null && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    {item.parsed_weight_g >= 1000
                      ? `${(item.parsed_weight_g / 1000).toFixed(item.parsed_weight_g % 1000 === 0 ? 0 : 1)}kg/L`
                      : `${item.parsed_weight_g}g/ml`}
                  </span>
                )}
                {item.reviewed && item.food && (
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">✓ In inventory</span>
                )}
                {!item.food_item_id && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">⚠ Needs cataloguing</span>
                )}
                {item.price != null && (
                  <span className="text-gray-400 ml-1">
                    €{(item.price * item.quantity).toFixed(2)}
                    {item.quantity > 1 && <span className="text-gray-300 text-xs ml-1">(€{item.price.toFixed(2)} ea)</span>}
                  </span>
                )}
              </div>
              <div className="flex gap-2 ml-2 shrink-0">
                <button onClick={() => setLinkTarget(item.id)}
                  className={`text-xs px-2 py-1 rounded ${item.food_item_id ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                  {item.food_item_id ? 'Re-link' : 'Link Food'}
                </button>
                {item.food_item_id && !item.reviewed && (
                  <button onClick={() => addToInv.mutate({ itemId: item.id, qty: item.quantity ?? 1, unit: 'piece' })}
                    className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">
                    + Inventory
                  </button>
                )}
                <button onClick={() => deleteItem.mutate(item.id)}
                  className="text-xs text-red-400 hover:text-red-600 px-1 py-1 rounded">
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {linkTarget !== null && (
        <LinkModal receiptId={receipt.id} itemId={linkTarget} onClose={() => setLinkTarget(null)} />
      )}
    </div>
  )
}

export default function Receipts() {
  const [store, setStore] = useState('jumbo')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [applyMsg, setApplyMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const applyMappings = useMutation({
    mutationFn: () => applyAllMappings(),
    onSuccess: (res) => {
      const d = res.data
      setApplyMsg(`✓ Applied ${d.mappings_applied} rules → updated ${d.receipt_items_updated} receipt items, ${d.inventory_items_updated} inventory items`)
      qc.invalidateQueries({ queryKey: ['receipts'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setTimeout(() => setApplyMsg(''), 5000)
    },
  })

  const { data: receipts, isLoading } = useQuery<ReceiptSummary[]>({
    queryKey: ['receipts'],
    queryFn: () => getReceipts().then(r => r.data),
  })

  const handleUpload= async () => {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('store', store)
      fd.append('file', file)
      await uploadReceipt(fd)
      qc.invalidateQueries({ queryKey: ['receipts'] })
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setUploadError(err?.response?.data?.detail ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Receipts</h1>
        <button
          onClick={() => applyMappings.mutate()}
          disabled={applyMappings.isPending}
          className="text-sm bg-indigo-500 text-white px-3 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-50 shrink-0">
          {applyMappings.isPending ? 'Applying…' : '🔗 Re-apply Mappings'}
        </button>
      </div>
      {applyMsg && <p className="text-green-700 text-sm bg-green-50 rounded-lg px-3 py-2">{applyMsg}</p>}

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold text-gray-700">Upload Receipt</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Store</label>
            <select value={store} onChange={e => setStore(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="jumbo">Jumbo (PNG)</option>
              <option value="netto">Netto (PDF)</option>
              <option value="albert_heijn">Albert Heijn (PDF)</option>
              <option value="lidl">Lidl (PDF)</option>
              <option value="aldi">Aldi (PDF)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">File</label>
            <input ref={fileRef} type="file" accept=".png,.jpg,.pdf"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="text-sm" />
          </div>
          <button onClick={handleUpload} disabled={!file || uploading}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50">
            {uploading ? 'Uploading…' : 'Upload & Parse'}
          </button>
        </div>
        {uploadError && <p className="text-red-500 text-sm">{uploadError}</p>}
      </div>

      <div className="space-y-3">
        {isLoading ? <p className="text-gray-400">Loading…</p> : null}
        {receipts?.map(r => <ReceiptRow key={r.id} receipt={r} />)}
        {receipts?.length === 0 && <p className="text-gray-400 text-sm">No receipts yet.</p>}
      </div>
    </div>
  )
}

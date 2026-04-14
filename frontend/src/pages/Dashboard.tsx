import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConsumptionSummary, getExpiringInventory, getInventory, getGoals, getNutritionHistory } from '../api/client'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type Goals = Record<string, { calories: number; protein: number; carbs: number; fat: number; fiber: number }>
type Summary = { date: string; summary: Record<string, { calories: number; protein: number; carbs: number; fat: number; items: number }> }
type InventoryItem = { id: number; food_name?: string; quantity_remaining?: number; quantity: number; unit: string; expiry_date?: string; status: string }

const PERSON_CONFIG: Record<string, { label: string; icon: string; color: string; barColor: string }> = {
  daniel: { label: 'Daniel', icon: '🦁', color: '#3b82f6', barColor: '#3b82f6' },
  thirza: { label: 'Thirza', icon: '🌸', color: '#ec4899', barColor: '#ec4899' },
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function DonutMacro({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min(100, (value / Math.max(1, goal)) * 100)
  const data = [{ v: pct }, { v: 100 - pct }]
  return (
    <div className="flex flex-col items-center gap-1">
      <PieChart width={70} height={70}>
        <Pie data={data} cx={30} cy={30} innerRadius={22} outerRadius={32} startAngle={90} endAngle={-270} dataKey="v" stroke="none">
          <Cell fill={color} />
          <Cell fill="#f3f4f6" />
        </Pie>
      </PieChart>
      <div className="text-center">
        <div className="text-xs font-semibold text-gray-700">{Math.round(value)}</div>
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-xs text-gray-300">/{Math.round(goal)}</div>
      </div>
    </div>
  )
}

function PersonCard({ person, summary, goals }: { person: string; summary?: { calories: number; protein: number; carbs: number; fat: number }; goals?: { calories: number; protein: number; carbs: number; fat: number } }) {
  const cfg = PERSON_CONFIG[person]
  const s = summary ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
  const g = goals ?? { calories: 2000, protein: 150, carbs: 250, fat: 65 }
  const calPct = Math.min(100, Math.round((s.calories / Math.max(1, g.calories)) * 100))
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{cfg?.icon ?? '👤'}</span>
        <div>
          <div className="font-semibold text-gray-800">{cfg?.label ?? person}</div>
          <div className="text-xs text-gray-400">{calPct}% of daily calorie goal</div>
        </div>
        <div className="ml-auto text-2xl font-bold text-gray-700">{Math.round(s.calories)} <span className="text-sm font-normal text-gray-400">kcal</span></div>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full mb-3 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${calPct}%`, backgroundColor: cfg?.color ?? '#6b7280' }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <DonutMacro label="Protein" value={s.protein} goal={g.protein} color="#3b82f6" />
        <DonutMacro label="Carbs" value={s.carbs} goal={g.carbs} color="#f59e0b" />
        <DonutMacro label="Fat" value={s.fat} goal={g.fat} color="#ef4444" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const { data: summary } = useQuery<Summary>({
    queryKey: ['consumption-summary', date],
    queryFn: () => getConsumptionSummary(date).then(r => r.data),
  })
  const { data: goals } = useQuery<Goals>({
    queryKey: ['goals'],
    queryFn: () => getGoals().then(r => r.data),
  })
  const { data: expiring } = useQuery<InventoryItem[]>({
    queryKey: ['expiring', 7],
    queryFn: () => getExpiringInventory(7).then(r => r.data),
  })
  const { data: allInventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', false],
    queryFn: () => getInventory(false).then(r => r.data),
  })
  const { data: history } = useQuery({
    queryKey: ['nutrition', 'history'],
    queryFn: () => getNutritionHistory().then(r => r.data),
  })

  const lowStock = (allInventory ?? []).filter(i => i.status === 'in_stock' && (i.quantity_remaining ?? i.quantity) <= 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* Per-person macro cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['daniel', 'thirza'].map(person => (
          <PersonCard key={person} person={person}
            summary={summary?.summary?.[person]}
            goals={goals?.[person]} />
        ))}
      </div>

      {/* Expiring + Low Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {expiring && expiring.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h2 className="font-semibold text-amber-800 mb-2">⚠ Expiring This Week ({expiring.length})</h2>
            <div className="space-y-1">
              {expiring.slice(0, 5).map(item => {
                const days = daysUntil(item.expiry_date!)
                return (
                  <div key={item.id} className="flex items-center justify-between text-sm bg-white rounded px-2 py-1">
                    <span className="font-medium truncate">{item.food_name ?? 'Unknown'}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ml-2 shrink-0 ${days <= 0 ? 'bg-red-100 text-red-700' : days <= 2 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {days <= 0 ? 'Expired' : `${days}d`}
                    </span>
                  </div>
                )
              })}
              {expiring.length > 5 && <p className="text-xs text-amber-600 mt-1">+{expiring.length - 5} more → see Inventory</p>}
            </div>
          </div>
        )}
        {lowStock.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h2 className="font-semibold text-blue-800 mb-2">📦 Low Stock ({lowStock.length})</h2>
            <div className="space-y-1">
              {lowStock.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm bg-white rounded px-2 py-1">
                  <span className="font-medium truncate">{item.food_name ?? 'Unknown'}</span>
                  <span className="text-xs text-gray-400 ml-2 shrink-0">{item.quantity_remaining ?? item.quantity} {item.unit}</span>
                </div>
              ))}
              {lowStock.length > 5 && <p className="text-xs text-blue-600 mt-1">+{lowStock.length - 5} more → see Inventory</p>}
            </div>
          </div>
        )}
      </div>

      {/* Weekly calorie trend */}
      {history && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Last 7 Days — Calories</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${Math.round(v)} kcal`]} />
              <Bar dataKey="total_calories" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Calories" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDailyNutrition, getNutritionHistory } from '../api/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const GOALS = { calories: 2000, protein: 150, carbs: 250, fat: 65 }

function MacroCard({
  label, value, goal, color
}: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min(100, Math.round((value / goal) * 100))
  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className="text-xs text-gray-400">/ {goal}{label === 'Calories' ? ' kcal' : 'g'}</span>
      </div>
      <span className="text-2xl font-bold text-gray-800">
        {value.toFixed(0)}{label === 'Calories' ? ' kcal' : 'g'}
      </span>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400">{pct}% of goal</span>
    </div>
  )
}

export default function Dashboard() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const { data: daily, isLoading } = useQuery({
    queryKey: ['nutrition', 'daily', date],
    queryFn: () => getDailyNutrition(date).then(r => r.data),
  })

  const { data: history } = useQuery({
    queryKey: ['nutrition', 'history'],
    queryFn: () => getNutritionHistory().then(r => r.data),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MacroCard label="Calories" value={daily?.total_calories ?? 0} goal={GOALS.calories} color="bg-amber-400" />
            <MacroCard label="Protein" value={daily?.total_protein ?? 0} goal={GOALS.protein} color="bg-blue-400" />
            <MacroCard label="Carbs" value={daily?.total_carbs ?? 0} goal={GOALS.carbs} color="bg-green-400" />
            <MacroCard label="Fat" value={daily?.total_fat ?? 0} goal={GOALS.fat} color="bg-red-400" />
          </div>

          {/* Today's Meals */}
          <div className="bg-white rounded-xl shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Today's Meals</h2>
            {daily?.meals?.length === 0 ? (
              <p className="text-gray-400 text-sm">No meals logged today.</p>
            ) : (
              <div className="divide-y">
                {daily?.meals?.map((m: {
                  meal_name: string; servings: number; calories: number;
                  protein: number; carbs: number; fat: number; logged_at: string
                }, i: number) => (
                  <div key={i} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{m.meal_name}</span>
                      <span className="ml-2 text-gray-400">×{m.servings}</span>
                    </div>
                    <div className="flex gap-3 text-gray-500">
                      <span>{m.calories.toFixed(0)} kcal</span>
                      <span>P:{m.protein.toFixed(0)}g</span>
                      <span>C:{m.carbs.toFixed(0)}g</span>
                      <span>F:{m.fat.toFixed(0)}g</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 7-day history chart */}
      {history && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Last 7 Days — Calories</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v} kcal`, 'Calories']} />
              <Bar dataKey="total_calories" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

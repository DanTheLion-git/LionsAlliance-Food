import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConsumption, getConsumptionSummary, deleteConsumption } from '../api/client'

type ConsumptionEntry = {
  id: number; person: string; amount: number; unit: string;
  consumed_at: string; raw_name?: string; food_name?: string; food_brand?: string;
  calories?: number; protein?: number; carbs?: number; fat?: number;
  notes?: string;
}
type Summary = {
  date: string;
  summary: Record<string, { calories: number; protein: number; carbs: number; fat: number; items: number }>;
}

const PERSON_LABELS: Record<string, string> = {
  daniel: '🦁 Daniel',
  thirza: '🌸 Thirza',
  other: '👤 Other',
}
const PERSON_COLORS: Record<string, string> = {
  daniel: 'bg-blue-100 text-blue-700',
  thirza: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-gray-600',
}

function MacroBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color}`}>{Math.round(value)}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}

export default function Diary() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [filterPerson, setFilterPerson] = useState<string>('all')
  const qc = useQueryClient()

  const { data: entries } = useQuery<ConsumptionEntry[]>({
    queryKey: ['consumption', date, filterPerson],
    queryFn: () => getConsumption(date, filterPerson === 'all' ? undefined : filterPerson).then(r => r.data),
  })

  const { data: summary } = useQuery<Summary>({
    queryKey: ['consumption-summary', date],
    queryFn: () => getConsumptionSummary(date).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteConsumption(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consumption'] })
      qc.invalidateQueries({ queryKey: ['consumption-summary'] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Diet Diary</h1>
        <div className="flex gap-2 items-center">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="all">Everyone</option>
            <option value="daniel">Daniel</option>
            <option value="thirza">Thirza</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Daily summaries per person */}
      {summary && Object.keys(summary.summary).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(summary.summary).map(([person, s]) => (
            <div key={person} className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-semibold px-2 py-1 rounded-full ${PERSON_COLORS[person] ?? 'bg-gray-100 text-gray-600'}`}>
                  {PERSON_LABELS[person] ?? person}
                </span>
                <span className="text-xs text-gray-400">{s.items} items</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <MacroBar label="kcal" value={s.calories} color="text-orange-500" />
                <MacroBar label="protein" value={s.protein} color="text-blue-500" />
                <MacroBar label="carbs" value={s.carbs} color="text-yellow-500" />
                <MacroBar label="fat" value={s.fat} color="text-red-400" />
              </div>
            </div>
          ))}
        </div>
      )}
      {summary && Object.keys(summary.summary).length === 0 && (
        <p className="text-gray-400 text-sm">No consumption logged for this day yet.</p>
      )}

      {/* Entry list */}
      {entries && entries.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700">Entries</div>
          <div className="divide-y">
            {entries.map(entry => (
              <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 mt-0.5 ${PERSON_COLORS[entry.person] ?? 'bg-gray-100'}`}>
                    {PERSON_LABELS[entry.person] ?? entry.person}
                  </span>
                  <div>
                    <div className="font-medium text-sm">{entry.food_name ?? entry.raw_name ?? 'Unknown'}</div>
                    {entry.food_brand && <div className="text-xs text-gray-400">{entry.food_brand}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {entry.amount} {entry.unit} · {new Date(entry.consumed_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {(entry.calories || 0) > 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {Math.round(entry.calories ?? 0)} kcal · P: {Math.round(entry.protein ?? 0)}g · C: {Math.round(entry.carbs ?? 0)}g · F: {Math.round(entry.fat ?? 0)}g
                      </div>
                    )}
                    {entry.notes && <div className="text-xs text-gray-400 italic mt-0.5">{entry.notes}</div>}
                  </div>
                </div>
                <button onClick={() => deleteMut.mutate(entry.id)}
                  className="text-red-300 hover:text-red-500 text-xs shrink-0">🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

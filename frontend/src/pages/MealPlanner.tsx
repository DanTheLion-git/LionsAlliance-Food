import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMealPlan, createMealPlanEntry, deleteMealPlanEntry, getMeals } from '../api/client'

type MealPlanEntry = { id: number; planned_date: string; meal_type: string; meal_name?: string; servings: number; person?: string; notes?: string }
type Meal = { id: number; name: string }

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_TYPE_ICONS: Record<string, string> = { breakfast: '🌅', lunch: '🌤', dinner: '🌙', snack: '🍎' }

function getWeekDates(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

function toISO(d: Date) { return d.toISOString().slice(0, 10) }

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function AddEntryModal({ date, onClose }: { date: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [mealType, setMealType] = useState('dinner')
  const [mealId, setMealId] = useState<number | null>(null)
  const [nameOverride, setNameOverride] = useState('')
  const [servings, setServings] = useState('1')
  const [person, setPerson] = useState('')

  const { data: meals } = useQuery<Meal[]>({
    queryKey: ['meals'],
    queryFn: () => getMeals().then(r => r.data),
  })

  const mut = useMutation({
    mutationFn: () => createMealPlanEntry({
      planned_date: date,
      meal_type: mealType,
      meal_id: mealId ?? undefined,
      meal_name_override: !mealId ? nameOverride : undefined,
      servings: parseFloat(servings),
      person: person || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meal-plan'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">Add Meal — {date}</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Meal Type</label>
          <div className="flex gap-2">
            {MEAL_TYPES.map(t => (
              <button key={t} onClick={() => setMealType(t)}
                className={`flex-1 py-1.5 text-xs rounded-lg border ${mealType === t ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600'}`}>
                {MEAL_TYPE_ICONS[t]} {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From Meal Catalog</label>
          <select value={mealId ?? ''} onChange={e => setMealId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">— Free text —</option>
            {(meals ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {!mealId && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Meal Name</label>
            <input value={nameOverride} onChange={e => setNameOverride(e.target.value)}
              placeholder="e.g. Pasta Bolognese"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Servings</label>
            <input type="number" value={servings} onChange={e => setServings(e.target.value)} min="0.5" step="0.5"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">For</label>
            <select value={person} onChange={e => setPerson(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">Both</option>
              <option value="daniel">🦁 Daniel</option>
              <option value="thirza">🌸 Thirza</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || (!mealId && !nameOverride)}
            className="flex-1 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MealPlanner() {
  const qc = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [addDate, setAddDate] = useState<string | null>(null)
  const weekStr = toISO(weekStart)
  const days = getWeekDates(weekStart)

  const { data: entries } = useQuery<MealPlanEntry[]>({
    queryKey: ['meal-plan', weekStr],
    queryFn: () => getMealPlan(weekStr).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteMealPlanEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plan'] }),
  })

  const prevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
  const nextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
  const goToday = () => setWeekStart(getWeekStart(new Date()))

  const DAYS_NL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Meal Planner</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="px-2 py-1.5 bg-gray-100 rounded hover:bg-gray-200 text-sm">‹</button>
          <button onClick={goToday} className="px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200 text-sm">Today</button>
          <button onClick={nextWeek} className="px-2 py-1.5 bg-gray-100 rounded hover:bg-gray-200 text-sm">›</button>
        </div>
      </div>
      <p className="text-sm text-gray-500">{toISO(weekStart)} — {toISO(days[6])}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {days.map((day, i) => {
          const iso = toISO(day)
          const dayEntries = (entries ?? []).filter(e => e.planned_date === iso)
          const isToday = iso === toISO(new Date())
          return (
            <div key={iso} className={`bg-white rounded-xl shadow p-3 min-h-32 flex flex-col gap-2 ${isToday ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-500">{DAYS_NL[i]}</div>
                  <div className={`text-sm font-bold ${isToday ? 'text-brand-600' : 'text-gray-800'}`}>{day.getDate()}</div>
                </div>
                <button onClick={() => setAddDate(iso)}
                  className="text-gray-300 hover:text-brand-500 text-lg leading-none">+</button>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                {dayEntries.map(entry => (
                  <div key={entry.id} className="group relative bg-gray-50 rounded px-2 py-1 text-xs">
                    <span className="text-gray-400 mr-1">{MEAL_TYPE_ICONS[entry.meal_type]}</span>
                    <span className="font-medium text-gray-700">{entry.meal_name ?? '?'}</span>
                    {entry.person && <span className="ml-1 text-gray-400">{entry.person === 'daniel' ? '🦁' : '🌸'}</span>}
                    <button onClick={() => deleteMut.mutate(entry.id)}
                      className="absolute top-0 right-1 hidden group-hover:block text-gray-300 hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {addDate && <AddEntryModal date={addDate} onClose={() => setAddDate(null)} />}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMeals, createMeal, getMeal, addMealIngredient,
  deleteMealIngredient, logMeal, getFoods, getDailyNutrition
} from '../api/client'

type FoodItem = { id: number; name: string; brand?: string; calories_per_100g?: number }
type Ingredient = {
  id: number; food_item_id: number; amount_grams: number;
  food_name?: string; food_brand?: string;
  macro_calories?: number; macro_protein?: number; macro_carbs?: number; macro_fat?: number
}
type MealDetail = {
  id: number; name: string; description?: string;
  ingredients: Ingredient[]
  total_macros: { calories: number; protein: number; carbs: number; fat: number }
}
type MealSummary = {
  id: number; name: string; description?: string;
  ingredient_count: number; total_calories: number;
  total_protein: number; total_carbs: number; total_fat: number
}

function AddIngredientModal({ mealId, onClose }: { mealId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<FoodItem | null>(null)
  const [mode, setMode] = useState<'grams' | 'percent'>('grams')
  const [amount, setAmount] = useState('100')
  const [refGrams, setRefGrams] = useState('500')

  const { data: foods } = useQuery<FoodItem[]>({
    queryKey: ['foods', q],
    queryFn: () => getFoods(q).then(r => r.data),
  })

  const addMutation = useMutation({
    mutationFn: () => {
      const payload = mode === 'grams'
        ? { food_item_id: selected!.id, amount_grams: parseFloat(amount) }
        : { food_item_id: selected!.id, percentage: parseFloat(amount), reference_grams: parseFloat(refGrams) }
      return addMealIngredient(mealId, payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meal', mealId] }); onClose() },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Add Ingredient</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        {!selected ? (
          <>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search food catalog…"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div className="max-h-64 overflow-y-auto divide-y">
              {(foods || []).map(f => (
                <button key={f.id} onClick={() => setSelected(f)}
                  className="w-full text-left px-2 py-2 hover:bg-gray-50 text-sm">
                  {f.name} {f.brand && <span className="text-gray-400">({f.brand})</span>}
                  {f.calories_per_100g != null && <span className="ml-2 text-gray-400">{f.calories_per_100g} kcal</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm"><span className="font-medium">Selected:</span> {selected.name}</p>
            <div className="flex gap-2">
              <button onClick={() => setMode('grams')} className={`flex-1 py-1.5 text-sm rounded ${mode === 'grams' ? 'bg-brand-500 text-white' : 'bg-gray-100'}`}>Grams</button>
              <button onClick={() => setMode('percent')} className={`flex-1 py-1.5 text-sm rounded ${mode === 'percent' ? 'bg-brand-500 text-white' : 'bg-gray-100'}`}>Percentage</button>
            </div>
            {mode === 'grams' ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount (g)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Percentage (%)</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reference total weight (g)</label>
                  <input type="number" value={refGrams} onChange={e => setRefGrams(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setSelected(null)} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Back</button>
              <button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}
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

function LogMealModal({ mealId, mealName, onClose }: { mealId: number; mealName: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [servings, setServings] = useState('1')
  const [notes, setNotes] = useState('')
  const logMutation = useMutation({
    mutationFn: () => logMeal(mealId, { servings: parseFloat(servings), notes: notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition'] })
      onClose()
    },
  })
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Log "{mealName}"</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Servings</label>
            <input type="number" step="0.25" min="0.25" value={servings} onChange={e => setServings(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button onClick={() => logMutation.mutate()} disabled={logMutation.isPending}
              className="flex-1 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
              Log Meal
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MealCard({ meal }: { meal: MealSummary }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [showAddIng, setShowAddIng] = useState(false)
  const [showLog, setShowLog] = useState(false)

  const { data: detail } = useQuery<MealDetail>({
    queryKey: ['meal', meal.id],
    queryFn: () => getMeal(meal.id).then(r => r.data),
    enabled: expanded,
  })

  const delIngredient = useMutation({
    mutationFn: (ingId: number) => deleteMealIngredient(meal.id, ingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal', meal.id] }),
  })

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left">
        <div>
          <span className="font-semibold">{meal.name}</span>
          <span className="ml-3 text-sm text-gray-400">{meal.ingredient_count} ingredients</span>
          <span className="ml-3 text-sm text-amber-600 font-medium">{meal.total_calories.toFixed(0)} kcal</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); setShowLog(true) }}
            className="text-xs bg-brand-500 text-white px-3 py-1 rounded-lg hover:bg-brand-600">
            Log
          </button>
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {detail ? (
            <>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span>🔥 {detail.total_macros.calories.toFixed(0)} kcal</span>
                <span>💪 {detail.total_macros.protein.toFixed(1)}g protein</span>
                <span>🌾 {detail.total_macros.carbs.toFixed(1)}g carbs</span>
                <span>🧈 {detail.total_macros.fat.toFixed(1)}g fat</span>
              </div>
              <div className="divide-y">
                {detail.ingredients.map(ing => (
                  <div key={ing.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{ing.food_name}</span>
                      <span className="ml-2 text-gray-400">{ing.amount_grams}g</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-xs">{ing.macro_calories?.toFixed(0)} kcal</span>
                      <button onClick={() => delIngredient.mutate(ing.id)}
                        className="text-red-400 hover:text-red-600 text-xs">×</button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAddIng(true)}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                + Add Ingredient
              </button>
            </>
          ) : (
            <p className="text-gray-400 text-sm">Loading…</p>
          )}
        </div>
      )}

      {showAddIng && <AddIngredientModal mealId={meal.id} onClose={() => setShowAddIng(false)} />}
      {showLog && <LogMealModal mealId={meal.id} mealName={meal.name} onClose={() => setShowLog(false)} />}
    </div>
  )
}

export default function Meals() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const { data: meals, isLoading } = useQuery<MealSummary[]>({
    queryKey: ['meals'],
    queryFn: () => getMeals().then(r => r.data),
  })

  const { data: todayLog } = useQuery({
    queryKey: ['nutrition', 'daily'],
    queryFn: () => getDailyNutrition().then(r => r.data),
  })

  const createMealMutation = useMutation({
    mutationFn: () => createMeal({ name: newName, description: newDesc || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meals'] })
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
    },
  })

  return (
    <div className="space-y-8">
      {/* Meal Builder */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Meal Builder</h1>
          <button onClick={() => setShowCreate(true)}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600">
            + New Meal
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <h2 className="font-semibold">New Meal</h2>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Meal name *"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={() => createMealMutation.mutate()} disabled={!newName || createMealMutation.isPending}
                className="flex-1 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                Create
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-3">
            {meals?.map(m => <MealCard key={m.id} meal={m} />)}
            {meals?.length === 0 && <p className="text-gray-400 text-sm">No meals yet. Create your first meal!</p>}
          </div>
        )}
      </div>

      {/* Today's Meal Log */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-gray-800">Today's Log</h2>
        <div className="bg-white rounded-xl shadow p-4">
          {todayLog?.meals?.length === 0 ? (
            <p className="text-gray-400 text-sm">No meals logged today.</p>
          ) : (
            <div className="divide-y">
              {todayLog?.meals?.map((m: {
                meal_name: string; servings: number; calories: number;
                protein: number; carbs: number; fat: number; logged_at: string
              }, i: number) => (
                <div key={i} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{m.meal_name}</span>
                    <span className="ml-2 text-gray-400">×{m.servings}</span>
                    <span className="ml-2 text-gray-400">{m.logged_at?.slice(11, 16)}</span>
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
      </div>
    </div>
  )
}

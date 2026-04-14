import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWeeklyReport, getMonthlyReport } from '../api/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

const PERSON_COLORS = { daniel: '#3b82f6', thirza: '#ec4899' }

export default function Reports() {
  const [tab, setTab] = useState<'weekly' | 'monthly'>('weekly')
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return d.toISOString().slice(0, 10)
  })
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const { data: weekly } = useQuery({
    queryKey: ['reports', 'weekly', weekStart],
    queryFn: () => getWeeklyReport(weekStart).then(r => r.data),
    enabled: tab === 'weekly',
  })

  const { data: monthly } = useQuery({
    queryKey: ['reports', 'monthly', month],
    queryFn: () => getMonthlyReport(month).then(r => r.data),
    enabled: tab === 'monthly',
  })

  const weeklyChartData = weekly ? Object.entries(weekly.days).map(([date, persons]: [string, any]) => ({
    date: date.slice(5),
    daniel: Math.round(persons.daniel?.calories ?? 0),
    thirza: Math.round(persons.thirza?.calories ?? 0),
  })) : []

  const monthlyChartData = monthly ? Object.entries(monthly.weeks).map(([week, persons]: [string, any]) => ({
    week,
    daniel: Math.round(persons.daniel?.calories ?? 0),
    thirza: Math.round(persons.thirza?.calories ?? 0),
  })) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab('weekly')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'weekly' ? 'bg-brand-500 text-white' : 'bg-gray-100'}`}>Weekly</button>
          <button onClick={() => setTab('monthly')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'monthly' ? 'bg-brand-500 text-white' : 'bg-gray-100'}`}>Monthly</button>
        </div>
      </div>

      {tab === 'weekly' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500">Week starting:</label>
            <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          {weekly && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Object.entries(weekly.person_totals).map(([person, totals]: [string, any]) => (
                  <div key={person} className="bg-white rounded-xl shadow p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{person === 'daniel' ? '🦁' : person === 'thirza' ? '🌸' : '👤'}</span>
                      <span className="font-semibold capitalize">{person}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-400 text-xs">Calories</span><div className="font-bold">{Math.round(totals.calories)}</div></div>
                      <div><span className="text-gray-400 text-xs">Protein</span><div className="font-bold">{Math.round(totals.protein)}g</div></div>
                      <div><span className="text-gray-400 text-xs">Carbs</span><div className="font-bold">{Math.round(totals.carbs)}g</div></div>
                      <div><span className="text-gray-400 text-xs">Fat</span><div className="font-bold">{Math.round(totals.fat)}g</div></div>
                    </div>
                  </div>
                ))}
                <div className="bg-white rounded-xl shadow p-4 flex flex-col justify-center">
                  <div className="text-3xl font-bold text-red-500">{weekly.discarded_count}</div>
                  <div className="text-sm text-gray-400 mt-1">items discarded this week</div>
                </div>
              </div>
              {weeklyChartData.length > 0 && (
                <div className="bg-white rounded-xl shadow p-4">
                  <h2 className="font-semibold mb-3">Daily Calories</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={weeklyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="daniel" name="Daniel" fill={PERSON_COLORS.daniel} stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="thirza" name="Thirza" fill={PERSON_COLORS.thirza} stackId="a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500">Month:</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          {monthly && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Object.entries(monthly.person_totals).map(([person, totals]: [string, any]) => (
                  <div key={person} className="bg-white rounded-xl shadow p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{person === 'daniel' ? '🦁' : person === 'thirza' ? '🌸' : '👤'}</span>
                      <span className="font-semibold capitalize">{person}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-400 text-xs">Total kcal</span><div className="font-bold">{Math.round(totals.calories)}</div></div>
                      <div><span className="text-gray-400 text-xs">Avg/day</span><div className="font-bold">{Math.round(totals.calories / 30)}</div></div>
                      <div><span className="text-gray-400 text-xs">Protein</span><div className="font-bold">{Math.round(totals.protein)}g</div></div>
                      <div><span className="text-gray-400 text-xs">Items</span><div className="font-bold">{totals.items}</div></div>
                    </div>
                  </div>
                ))}
                <div className="bg-white rounded-xl shadow p-4 flex flex-col justify-center">
                  <div className="text-3xl font-bold text-red-500">{monthly.discarded_count}</div>
                  <div className="text-sm text-gray-400 mt-1">items discarded this month</div>
                </div>
              </div>
              {monthlyChartData.length > 0 && (
                <div className="bg-white rounded-xl shadow p-4">
                  <h2 className="font-semibold mb-3">Weekly Calories</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="daniel" name="Daniel" fill={PERSON_COLORS.daniel} stackId="a" />
                      <Bar dataKey="thirza" name="Thirza" fill={PERSON_COLORS.thirza} stackId="a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

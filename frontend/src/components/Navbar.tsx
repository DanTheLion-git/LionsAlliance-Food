import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

const links = [
  { to: '/', label: '📊 Dashboard' },
  { to: '/receipts', label: '🧾 Receipts' },
  { to: '/inventory', label: '📦 Inventory' },
  { to: '/catalog', label: '🥫 Catalog' },
  { to: '/meals', label: '🍳 Meals' },
  { to: '/diary', label: '📓 Diary' },
  { to: '/shopping', label: '🛒 Shopping' },
  { to: '/planner', label: '📅 Planner' },
  { to: '/reports', label: '📈 Reports' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-14">
          <span className="font-bold text-lg text-brand-600 shrink-0">🦁 Food Tracker</span>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1 overflow-x-auto">
            {links.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) => clsx(
                  'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                  isActive ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                )}>
                {label}
              </NavLink>
            ))}
          </div>
          {/* Mobile hamburger */}
          <button onClick={() => setOpen(o => !o)} className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
        {/* Mobile menu */}
        {open && (
          <div className="md:hidden pb-3 flex flex-col gap-1">
            {links.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => clsx(
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                )}>
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}

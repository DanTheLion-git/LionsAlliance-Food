import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/receipts', label: 'Receipts' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/catalog', label: 'Food Catalog' },
  { to: '/meals', label: 'Meals' },
  { to: '/diary', label: 'Diary' },
]

export default function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 max-w-7xl flex items-center gap-6 h-14">
        <span className="font-bold text-lg text-brand-600 shrink-0">🦁 Food Tracker</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}

import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Receipts from './pages/Receipts'
import Inventory from './pages/Inventory'
import FoodCatalog from './pages/FoodCatalog'
import Meals from './pages/Meals'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/catalog" element={<FoodCatalog />} />
          <Route path="/meals" element={<Meals />} />
        </Routes>
      </main>
    </div>
  )
}

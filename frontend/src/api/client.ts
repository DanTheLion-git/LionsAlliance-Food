import axios from 'axios'

const api = axios.create({ baseURL: '/api' })
export default api

// Foods
export const getFoods = (search?: string) =>
  api.get('/foods', { params: search ? { search } : {} })
export const createFood = (data: object) => api.post('/foods', data)
export const updateFood = (id: number, data: object) => api.put(`/foods/${id}`, data)
export const deleteFood = (id: number) => api.delete(`/foods/${id}`)
export const searchOFF = (q: string) => api.get('/foods/search/off', { params: { q } })

// Inventory
export const getInventory = (includeAll = false) =>
  api.get('/inventory', { params: includeAll ? { include_all: true } : {} })
export const getExpiringInventory = (days = 7) => api.get('/inventory/expiring', { params: { days } })
export const createInventory = (data: object) => api.post('/inventory', data)
export const updateInventory = (id: number, data: object) => api.put(`/inventory/${id}`, data)
export const updateInventoryStatus = (id: number, data: object) => api.patch(`/inventory/${id}/status`, data)
export const deleteInventory = (id: number) => api.delete(`/inventory/${id}`)

// Receipts
export const getReceipts = () => api.get('/receipts')
export const uploadReceipt = (formData: FormData) =>
  api.post('/receipts/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getReceipt = (id: number) => api.get(`/receipts/${id}`)
export const linkReceiptItem = (receiptId: number, itemId: number, foodItemId: number) =>
  api.post(`/receipts/${receiptId}/items/${itemId}/link`, { food_item_id: foodItemId })
export const addReceiptItemToInventory = (receiptId: number, itemId: number, data: object) =>
  api.post(`/receipts/${receiptId}/items/${itemId}/add-to-inventory`, data)
export const deleteReceiptItem = (receiptId: number, itemId: number) =>
  api.delete(`/receipts/${receiptId}/items/${itemId}`)
export const deleteReceipt = (receiptId: number) => api.delete(`/receipts/${receiptId}`)

// Meals
export const getMeals = () => api.get('/meals')
export const createMeal = (data: object) => api.post('/meals', data)
export const getMeal = (id: number) => api.get(`/meals/${id}`)
export const addMealIngredient = (mealId: number, data: object) =>
  api.post(`/meals/${mealId}/ingredients`, data)
export const deleteMealIngredient = (mealId: number, ingId: number) =>
  api.delete(`/meals/${mealId}/ingredients/${ingId}`)
export const logMeal = (mealId: number, data: object) => api.post(`/meals/${mealId}/log`, data)

// Nutrition
export const getDailyNutrition = (date?: string) =>
  api.get('/nutrition/daily', { params: date ? { date } : {} })
export const getNutritionHistory = () => api.get('/nutrition/history')
export const getConsumption = (date?: string, person?: string) =>
  api.get('/consumption', { params: { ...(date ? { date } : {}), ...(person ? { person } : {}) } })
export const getConsumptionSummary = (date?: string) =>
  api.get('/consumption/summary', { params: date ? { date } : {} })
export const createConsumption = (entries: object[]) => api.post('/consumption', entries)
export const applyAllMappings = () => api.post('/receipts/apply-all-mappings')

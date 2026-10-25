import apiClient from './client'

export interface Product {
  id: string
  name: string
  category: string
  description: string | null
  photo_url: string | null
  price: number
  is_active: boolean
  sort_order: number
  /** Below it the product goes on the list of what to buy; null: no threshold. */
  par_level: number | null
  /** The sum of its movements: below zero when a sale outran a forgotten purchase. */
  stock: number
  /** Missing up to par_level. */
  to_buy: number
  archived_at: string | null
}

export interface ProductInput {
  name: string
  category: string
  description: string | null
  price: number
  is_active: boolean
  sort_order: number
  par_level: number | null
}

export type MovementKind = 'purchase' | 'sale' | 'writeoff' | 'adjust'

export interface StockMovement {
  id: string
  product_id: string
  kind: MovementKind
  quantity: number
  unit_cost: number | null
  order_id: string | null
  note: string | null
  created_at: string | null
}

export interface MovementInput {
  kind: Exclude<MovementKind, 'sale'>
  quantity: number
  unit_cost: number | null
  spent_on: string | null
  note: string | null
}

export async function listProducts(): Promise<Product[]> {
  return (await apiClient.get<Product[]>('/inventory/products')).data
}

export async function createProduct(data: ProductInput): Promise<Product> {
  return (await apiClient.post<Product>('/inventory/products', data)).data
}

export async function updateProduct(id: string, data: Partial<ProductInput>): Promise<Product> {
  return (await apiClient.patch<Product>(`/inventory/products/${id}`, data)).data
}

export async function archiveProduct(id: string): Promise<Product> {
  return (await apiClient.post<Product>(`/inventory/products/${id}/archive`)).data
}

export async function uploadProductPhoto(id: string, file: File): Promise<Product> {
  const body = new FormData()
  body.append('file', file)
  return (await apiClient.post<Product>(`/inventory/products/${id}/photo`, body)).data
}

export async function listMovements(productId: string): Promise<StockMovement[]> {
  return (await apiClient.get<StockMovement[]>(`/inventory/products/${productId}/movements`)).data
}

export async function addMovement(productId: string, data: MovementInput): Promise<StockMovement> {
  return (await apiClient.post<StockMovement>(`/inventory/products/${productId}/movements`, data)).data
}

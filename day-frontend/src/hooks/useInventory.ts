import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMovement,
  archiveProduct,
  createProduct,
  listMovements,
  listProducts,
  updateProduct,
  uploadProductPhoto,
  type MovementInput,
  type ProductInput,
} from '../api/inventory'

const PRODUCTS_KEY = 'inventory-products'
const MOVEMENTS_KEY = 'inventory-movements'

export function useProducts(enabled = true) {
  return useQuery({ queryKey: [PRODUCTS_KEY], queryFn: listProducts, enabled })
}

export function useMovements(productId: string | null) {
  return useQuery({
    queryKey: [MOVEMENTS_KEY, productId],
    queryFn: () => listMovements(productId!),
    enabled: !!productId,
  })
}

/** Any change to the catalogue or the stock: the list and the histories read anew. */
function useStockChange<T>(change: (input: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PRODUCTS_KEY] })
      qc.invalidateQueries({ queryKey: [MOVEMENTS_KEY] })
    },
  })
}

export const useCreateProduct = () => useStockChange((data: ProductInput) => createProduct(data))
export const useUpdateProduct = () =>
  useStockChange(({ id, data }: { id: string; data: Partial<ProductInput> }) => updateProduct(id, data))
export const useArchiveProduct = () => useStockChange((id: string) => archiveProduct(id))
export const useUploadProductPhoto = () =>
  useStockChange(({ id, file }: { id: string; file: File }) => uploadProductPhoto(id, file))
export const useAddMovement = () =>
  useStockChange(({ productId, data }: { productId: string; data: MovementInput }) => addMovement(productId, data))

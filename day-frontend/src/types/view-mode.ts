export type ViewMode = 'cards' | 'table'

export function isViewMode(value: string | null): value is ViewMode {
  return value === 'cards' || value === 'table'
}

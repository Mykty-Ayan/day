import { useMemo, useSyncExternalStore } from 'react'

function createMediaQueryStore(query: string) {
  return {
    subscribe: (onStoreChange: () => void) => {
      if (typeof window === 'undefined') {
        return () => {}
      }

      const mediaQuery = window.matchMedia(query)
      const listener = () => onStoreChange()
      mediaQuery.addEventListener('change', listener)

      return () => {
        mediaQuery.removeEventListener('change', listener)
      }
    },
    getSnapshot: () => {
      if (typeof window === 'undefined') return false
      return window.matchMedia(query).matches
    },
  }
}

export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => createMediaQueryStore(query), [query])
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false)
}

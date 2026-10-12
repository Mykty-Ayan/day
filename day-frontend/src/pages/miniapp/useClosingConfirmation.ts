import { useEffect } from 'react'
import { setClosingConfirmation } from '../../lib/telegram'

/** While something typed would be lost, closing the Mini App asks first. */
export function useClosingConfirmation(active: boolean): void {
  useEffect(() => {
    if (!active) return
    setClosingConfirmation(true)
    return () => setClosingConfirmation(false)
  }, [active])
}

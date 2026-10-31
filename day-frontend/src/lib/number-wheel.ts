type WheelRoot = Pick<Document, 'activeElement' | 'addEventListener'>

/**
 * The wheel over a focused number field changes its value: the page was meant to
 * scroll, and a surcharge became 104 000. The field gives up focus and the page scrolls.
 */
export function keepNumbersFromTheWheel(root: WheelRoot) {
  root.addEventListener(
    'wheel',
    (event) => {
      const field = root.activeElement as HTMLInputElement | null
      if (field?.type === 'number' && event.target === field) field.blur()
    },
    { passive: true },
  )
}

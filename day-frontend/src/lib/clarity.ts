/** Microsoft Clarity (heatmaps, session recordings) on the guest pages only: the
 *  operator's app shows guests' phones and money and is never recorded. Off until
 *  VITE_CLARITY_ID is set at build time.
 *
 *  What a recording must not keep (a guest's booking: door code, Wi-Fi, name,
 *  phone) is marked with MASK; Clarity then never uploads that text. */

export const MASK = { 'data-clarity-mask': 'True' } as const

// The loader of Microsoft's own npm package (@microsoft/clarity), without the dependency.
export function loadClarity(projectId: string | undefined = import.meta.env.VITE_CLARITY_ID) {
  if (!projectId || document.getElementById('clarity-script')) return
  const w = window as Window & { clarity?: unknown }
  // Calls made before the script arrives wait in the queue it reads on load.
  if (!w.clarity) {
    const queue = Object.assign((...args: unknown[]) => void queue.q.push(args), { q: [] as unknown[] })
    w.clarity = queue
  }
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`
  script.id = 'clarity-script'
  document.head.appendChild(script)
}

import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex justify-between items-center p-4 border-b border-gray-100 bg-white">
        <span className="text-sm font-bold text-gray-900">Day</span>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

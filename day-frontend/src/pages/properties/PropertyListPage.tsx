import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useProperties } from '../../hooks/useProperties'
import type { PropertyStatus } from '../../types/property'
import PropertyCard from '../../components/property/PropertyCard'

const statusTabs: { value: PropertyStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
  { value: 'new', label: 'New' },
]

export default function PropertyListPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useProperties({
    page,
    per_page: 12,
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
  })

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Properties</h1>
          <Link to="/properties/new">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Property
            </motion.button>
          </Link>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search by name..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
          </div>
          <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setStatusFilter(tab.value)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  statusFilter === tab.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-gray-500 mb-4">No properties found</p>
            <Link to="/properties/new">
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create your first property
              </motion.button>
            </Link>
          </div>
        ) : (
          <>
            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.items.map((property, i) => (
                <PropertyCard key={property.id} property={property} index={i} />
              ))}
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </motion.button>
                <span className="text-xs font-bold text-gray-500 px-3">
                  Page {data.page} of {data.pages}
                </span>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page >= data.pages}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  )
}

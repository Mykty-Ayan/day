import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, LayoutGrid, Grid2X2, List } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useAllProperties } from '../../hooks/useProperties'
import type { PropertyStatus } from '../../types/property'
import PropertyCard from '../../components/property/PropertyCard'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'

const statusTabs: { value: PropertyStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
  { value: 'new', label: 'New' },
]

export default function PropertyListPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('active')
  const [viewMode, setViewMode] = useState<'large' | 'medium' | 'list'>('large')

  const { data, isLoading } = useAllProperties({
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
              }}
              placeholder="Search by name..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
          </div>
          <ToggleGroup
            type="single"
            value={statusFilter}
            onValueChange={(value) => {
              if (!value) return
              setStatusFilter(value as PropertyStatus | 'all')
            }}
          >
            {statusTabs.map((tab) => (
              <ToggleGroupItem key={tab.value} value={tab.value}>
                {tab.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (!value) return
              setViewMode(value as 'large' | 'medium' | 'list')
            }}
          >
            <ToggleGroupItem value="large" aria-label="Large tiles">
              <span className="inline-flex items-center gap-1">
                <LayoutGrid className="w-3.5 h-3.5" />
                Large
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem value="medium" aria-label="Medium tiles">
              <span className="inline-flex items-center gap-1">
                <Grid2X2 className="w-3.5 h-3.5" />
                Medium
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <span className="inline-flex items-center gap-1">
                <List className="w-3.5 h-3.5" />
                List
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
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
            <div
              className={`grid ${
                viewMode === 'large'
                  ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                  : viewMode === 'medium'
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'
                    : 'grid-cols-1 gap-2'
              }`}
            >
              {data.items.map((property, i) => (
                <PropertyCard key={property.id} property={property} index={i} variant={viewMode} />
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

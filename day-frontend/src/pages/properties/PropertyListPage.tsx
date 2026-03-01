import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, LayoutGrid, Grid2X2, List, Tag } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import { useAllProperties, useTags } from '../../hooks/useProperties'
import type { PropertyStatus } from '../../types/property'
import PropertyCard from '../../components/property/PropertyCard'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'

const statusTabValues: (PropertyStatus | 'all')[] = ['all', 'active', 'paused', 'archived', 'new']

export default function PropertyListPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all')
  const [viewMode, setViewMode] = useState<'large' | 'medium' | 'list'>('large')
  const [tagFilter, setTagFilter] = useState<string>('')
  const { data: tagsData } = useTags()
  const allTags = tagsData ?? []
  const primaryActionClass =
    'inline-flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors'

  const { data, isLoading } = useAllProperties({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    tag_id: tagFilter || undefined,
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
          <h1 className="text-xl font-bold text-gray-900">{t('properties.title')}</h1>
          <Link to="/properties/new" className={primaryActionClass}>
            <Plus className="w-4 h-4" />
            {t('properties.addProperty')}
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
              placeholder={t('properties.searchPlaceholder')}
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
            {statusTabValues.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {t(`common.${value}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              <div className="flex gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setTagFilter('')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                    !tagFilter
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {t('common.all')}
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setTagFilter(tagFilter === tag.id ? '' : tag.id)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                      tagFilter === tag.id
                        ? 'text-white'
                        : 'border border-gray-200 hover:opacity-80'
                    }`}
                    style={{
                      backgroundColor: tagFilter === tag.id ? tag.color : undefined,
                      color: tagFilter === tag.id ? 'white' : tag.color,
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
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
                {t('common.large')}
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem value="medium" aria-label="Medium tiles">
              <span className="inline-flex items-center gap-1">
                <Grid2X2 className="w-3.5 h-3.5" />
                {t('common.medium')}
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <span className="inline-flex items-center gap-1">
                <List className="w-3.5 h-3.5" />
                {t('common.list')}
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Content */}
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-gray-500 mb-4">{t('properties.noProperties')}</p>
            <Link to="/properties/new" className={primaryActionClass}>
              <Plus className="w-4 h-4" />
              {t('properties.createFirst')}
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

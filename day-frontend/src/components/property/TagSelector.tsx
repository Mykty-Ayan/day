import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, X, Check } from 'lucide-react'
import TagBadge from './TagBadge'

interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  allTags: Tag[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  onCreateTag?: (name: string, color: string) => void
  loading?: boolean
}

const TAG_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1',
]

export default function TagSelector({
  allTags,
  selectedIds,
  onChange,
  onCreateTag,
  loading = false,
}: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])

  function toggleTag(tagId: string) {
    if (selectedIds.includes(tagId)) {
      onChange(selectedIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedIds, tagId])
    }
  }

  function handleCreate() {
    if (!newName.trim() || !onCreateTag) return
    onCreateTag(newName.trim(), newColor)
    setNewName('')
    setShowCreate(false)
  }

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id))
  const unselectedTags = allTags.filter((t) => !selectedIds.includes(t.id))

  return (
    <div className="space-y-3">
      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              size="md"
              onRemove={() => toggleTag(tag.id)}
            />
          ))}
        </div>
      )}

      {/* Available tags */}
      {unselectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unselectedTags.map((tag) => (
            <motion.button
              key={tag.id}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
              <Plus className="w-3 h-3 text-gray-400" />
            </motion.button>
          ))}
        </div>
      )}

      {/* Create new tag */}
      {onCreateTag && (
        <>
          {!showCreate ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            >
              <Plus className="w-3 h-3" />
              Create Tag
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-gray-50 rounded-xl p-3 space-y-2"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div className="flex flex-wrap gap-1.5">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className="relative h-9 w-9 rounded-full"
                    style={{ backgroundColor: color }}
                  >
                    {newColor === color && (
                      <Check className="w-3 h-3 text-white absolute inset-0 m-auto" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleCreate}
                  disabled={loading || !newName.trim()}
                  className="min-h-[44px] rounded-lg bg-black px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                >
                  Create
                </motion.button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}

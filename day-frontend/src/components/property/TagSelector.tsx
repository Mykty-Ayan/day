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
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
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
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
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
              <div className="flex gap-1.5">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className="relative w-6 h-6 rounded-full"
                    style={{ backgroundColor: color }}
                  >
                    {newColor === color && (
                      <Check className="w-3 h-3 text-white absolute inset-0 m-auto" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleCreate}
                  disabled={loading || !newName.trim()}
                  className="bg-black text-white hover:bg-gray-800 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  Create
                </motion.button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2"
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

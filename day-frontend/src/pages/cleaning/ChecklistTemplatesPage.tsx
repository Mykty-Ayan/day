import { AnimatePresence, motion } from 'framer-motion'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import {
  useAddChecklistItem,
  useChecklistTemplate,
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistItem,
  useDeleteChecklistTemplate,
} from '../../hooks/useCleaning'

export default function ChecklistTemplatesPage() {
  const { data: templates, isLoading } = useChecklistTemplates()
  const createMutation = useCreateChecklistTemplate()
  const deleteMutation = useDeleteChecklistTemplate()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function handleCreate() {
    if (!newName.trim()) return
    createMutation.mutate(
      { name: newName.trim() },
      {
        onSuccess: () => {
          showToast('success', 'Template created')
          setNewName('')
          setShowCreate(false)
        },
        onError: (err: Error) => showToast('error', err.message),
      },
    )
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        showToast('success', 'Template deleted')
        if (selectedId === id) setSelectedId(null)
      },
      onError: (err: Error) => showToast('error', err.message),
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 max-w-5xl mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">
            Checklist Templates
          </h1>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4 mr-1" />
          New Template
        </Button>
      </div>

      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white rounded-2xl border border-gray-200 p-4 mb-6"
        >
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Template name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
            >
              Create
            </Button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : !templates?.length ? (
            <div className="text-center py-8 text-gray-400">
              No templates yet
            </div>
          ) : (
            templates.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                  selectedId === t.id
                    ? 'border-black shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedId(t.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{t.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(t.id)
                    }}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Created {new Date(t.created_at).toLocaleDateString()}
                </p>
              </motion.div>
            ))
          )}
        </div>

        {/* Template Detail */}
        <AnimatePresence mode="wait">
          {selectedId && (
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <TemplateDetail templateId={selectedId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function TemplateDetail({ templateId }: { templateId: string }) {
  const { data, isLoading } = useChecklistTemplate(templateId)
  const addItemMutation = useAddChecklistItem(templateId)
  const deleteItemMutation = useDeleteChecklistItem(templateId)
  const [newItemTitle, setNewItemTitle] = useState('')

  function handleAddItem() {
    if (!newItemTitle.trim()) return
    addItemMutation.mutate(
      { title: newItemTitle.trim() },
      {
        onSuccess: () => {
          setNewItemTitle('')
          showToast('success', 'Item added')
        },
      },
    )
  }

  if (isLoading) {
    return <div className="text-center py-8 text-gray-400">Loading...</div>
  }

  if (!data) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {data.template.name}
      </h2>

      <div className="space-y-2 mb-4">
        {data.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-6">
                {item.sort_order + 1}.
              </span>
              <span className="text-sm">{item.title}</span>
            </div>
            <button
              onClick={() => deleteItemMutation.mutate(item.id)}
              className="text-gray-300 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="New item..."
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-black/10 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
        />
        <Button
          onClick={handleAddItem}
          disabled={addItemMutation.isPending || !newItemTitle.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  )
}

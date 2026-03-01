import { AnimatePresence, motion } from 'framer-motion'
import { Check, ClipboardList, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import {
  useAddChecklistItem,
  useChecklistTemplate,
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistItem,
  useDeleteChecklistTemplate,
  useReorderChecklistItems,
  useUpdateChecklistItem,
  useUpdateChecklistTemplate,
} from '../../hooks/useCleaning'
import type { ChecklistItem } from '../../types/cleaning'

export default function ChecklistTemplatesPage() {
  const { t } = useTranslation()
  const { data: templates, isLoading } = useChecklistTemplates()
  const createMutation = useCreateChecklistTemplate()
  const deleteMutation = useDeleteChecklistTemplate()
  const updateTemplateMutation = useUpdateChecklistTemplate()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateNameDraft, setTemplateNameDraft] = useState('')

  function handleCreate() {
    if (!newName.trim()) return
    createMutation.mutate(
      { name: newName.trim() },
      {
        onSuccess: () => {
          showToast('success', t('checklists.templateCreated'))
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
        showToast('success', t('checklists.templateDeleted'))
        if (selectedId === id) setSelectedId(null)
      },
      onError: (err: Error) => showToast('error', err.message),
    })
  }

  function startTemplateEdit(id: string, currentName: string) {
    setEditingTemplateId(id)
    setTemplateNameDraft(currentName)
  }

  function cancelTemplateEdit() {
    setEditingTemplateId(null)
    setTemplateNameDraft('')
  }

  function submitTemplateEdit(id: string, currentName: string) {
    const name = templateNameDraft.trim()
    if (!name) {
      showToast('error', t('checklists.templateNameRequired'))
      return
    }
    if (name === currentName) {
      cancelTemplateEdit()
      return
    }
    updateTemplateMutation.mutate(
      { id, data: { name } },
      {
        onSuccess: () => {
          showToast('success', t('checklists.templateUpdated'))
          cancelTemplateEdit()
        },
        onError: (err: Error) => {
          showToast('error', err.message)
        },
      },
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-[1180px] mx-auto px-4 py-4 sm:px-6 sm:py-6"
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <ClipboardList className="w-6 h-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t('checklists.title')}
          </h1>
        </div>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex min-h-[44px] items-center gap-1 self-start whitespace-nowrap sm:self-auto"
        >
          <Plus className="w-4 h-4 mr-1" />
          {t('checklists.newTemplate')}
        </Button>
      </div>

      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white rounded-2xl border border-gray-200 p-4 mb-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder={t('checklists.templateName')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
              className="w-full sm:w-auto"
            >
              {t('common.create')}
            </Button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:justify-center">
        {/* Template List */}
        <div className="min-w-0 space-y-3 xl:w-[540px]">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">{t('common.loading')}</div>
          ) : !templates?.length ? (
            <div className="text-center py-8 text-gray-400">
              {t('checklists.noTemplates')}
            </div>
          ) : (
            templates.map((tmpl) => (
              <motion.div
                key={tmpl.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                  selectedId === tmpl.id
                    ? 'border-black shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedId(tmpl.id)}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  {editingTemplateId === tmpl.id ? (
                    <input
                      autoFocus
                      value={templateNameDraft}
                      onChange={(e) => setTemplateNameDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          submitTemplateEdit(tmpl.id, tmpl.name)
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelTemplateEdit()
                        }
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    />
                  ) : (
                    <span
                      className="min-h-[2.5rem] min-w-0 flex-1 break-words text-sm font-medium leading-5 line-clamp-2"
                      title={tmpl.name}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startTemplateEdit(tmpl.id, tmpl.name)
                      }}
                    >
                      {tmpl.name}
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    {editingTemplateId === tmpl.id ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            submitTemplateEdit(tmpl.id, tmpl.name)
                          }}
                          disabled={updateTemplateMutation.isPending}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                          aria-label="Save template name"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            cancelTemplateEdit()
                          }}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          aria-label="Cancel editing template name"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startTemplateEdit(tmpl.id, tmpl.name)
                        }}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Edit template name"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(tmpl.id)
                      }}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {t('checklists.created', { date: new Date(tmpl.created_at).toLocaleDateString() })}
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
              className="min-w-0 w-full xl:w-[540px]"
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
  const { t } = useTranslation()
  const { data, isLoading } = useChecklistTemplate(templateId)
  const addItemMutation = useAddChecklistItem(templateId)
  const deleteItemMutation = useDeleteChecklistItem(templateId)
  const reorderMutation = useReorderChecklistItems(templateId)
  const updateItemMutation = useUpdateChecklistItem(templateId)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [itemTitleDraft, setItemTitleDraft] = useState('')

  function handleAddItem() {
    if (!newItemTitle.trim()) return
    addItemMutation.mutate(
      { title: newItemTitle.trim() },
      {
        onSuccess: () => {
          setNewItemTitle('')
          showToast('success', t('checklists.itemAdded'))
        },
      },
    )
  }

  if (isLoading) {
    return <div className="text-center py-8 text-gray-400">{t('common.loading')}</div>
  }

  if (!data) return null
  const items = data.items

  function reorderList(
    list: ChecklistItem[],
    sourceId: string,
    targetId: string,
  ): ChecklistItem[] {
    const sourceIndex = list.findIndex((item) => item.id === sourceId)
    const targetIndex = list.findIndex((item) => item.id === targetId)
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
      return list
    }

    const next = [...list]
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved)
    return next
  }

  function handleDrop(targetId: string) {
    if (!draggingId) return
    if (draggingId === targetId) {
      setDraggingId(null)
      return
    }

    const next = reorderList(items, draggingId, targetId)
    if (next === items) {
      setDraggingId(null)
      return
    }
    reorderMutation.mutate(next.map((item) => item.id), {
      onError: (err: Error) => {
        showToast('error', err.message)
      },
    })
    setDraggingId(null)
  }

  function startItemEdit(item: ChecklistItem) {
    setEditingItemId(item.id)
    setItemTitleDraft(item.title)
  }

  function cancelItemEdit() {
    setEditingItemId(null)
    setItemTitleDraft('')
  }

  function submitItemEdit(item: ChecklistItem) {
    const title = itemTitleDraft.trim()
    if (!title) {
      showToast('error', t('checklists.itemTitleRequired'))
      return
    }
    if (title === item.title) {
      cancelItemEdit()
      return
    }
    updateItemMutation.mutate(
      {
        itemId: item.id,
        data: { title },
      },
      {
        onSuccess: () => {
          showToast('success', t('checklists.itemUpdated'))
          cancelItemEdit()
        },
        onError: (err: Error) => {
          showToast('error', err.message)
        },
      },
    )
  }

  return (
    <div className="w-full min-w-0 bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 break-words">
        {data.template.name}
      </h2>

      <div className="space-y-2 mb-4">
        {items.map((item, index) => (
          <div
            key={item.id}
            draggable={!reorderMutation.isPending && editingItemId !== item.id}
            onDragStart={(e) => {
              setDraggingId(item.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDragEnd={() => setDraggingId(null)}
            onDrop={() => handleDrop(item.id)}
            className={`flex max-w-full items-start gap-3 overflow-hidden rounded-lg border p-3 transition-colors sm:items-center ${
              draggingId === item.id
                ? 'bg-gray-100 border-gray-300'
                : 'bg-gray-50 border-transparent'
            } ${reorderMutation.isPending ? 'cursor-progress' : 'cursor-grab'}`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <GripVertical className="w-4 h-4 shrink-0 text-gray-300" />
              <span className="w-6 shrink-0 text-xs text-gray-400">
                {index + 1}.
              </span>
              {editingItemId === item.id ? (
                <input
                  autoFocus
                  value={itemTitleDraft}
                  onChange={(e) => setItemTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitItemEdit(item)
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelItemEdit()
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              ) : (
                <span
                  className="min-h-[2.5rem] min-w-0 flex-1 break-words text-sm leading-5 line-clamp-2"
                  title={item.title}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startItemEdit(item)
                  }}
                >
                  {item.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {editingItemId === item.id ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      submitItemEdit(item)
                    }}
                    disabled={updateItemMutation.isPending}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                    aria-label="Save checklist item"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      cancelItemEdit()
                    }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Cancel checklist item editing"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    startItemEdit(item)
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Edit checklist item"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => deleteItemMutation.mutate(item.id)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                aria-label="Delete checklist item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder={t('checklists.newItem')}
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-black/10 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
        />
        <Button
          onClick={handleAddItem}
          disabled={addItemMutation.isPending || !newItemTitle.trim()}
          className="w-full sm:w-auto sm:min-w-[96px]"
        >
          {t('common.add')}
        </Button>
      </div>
    </div>
  )
}

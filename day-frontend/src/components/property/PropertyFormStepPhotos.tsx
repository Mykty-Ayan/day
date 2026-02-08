import { useCallback, useRef } from 'react'
import { Upload, X, GripVertical, Star } from 'lucide-react'

export interface PhotoEntry {
  id: string
  file: File
  preview: string
  isCover: boolean
}

interface Props {
  photos: PhotoEntry[]
  onChange: (photos: PhotoEntry[]) => void
}

export default function PropertyFormStepPhotos({ photos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      const newPhotos: PhotoEntry[] = Array.from(files).map((file, i) => ({
        id: `${Date.now()}-${i}`,
        file,
        preview: URL.createObjectURL(file),
        isCover: photos.length === 0 && i === 0,
      }))
      onChange([...photos, ...newPhotos])
    },
    [photos, onChange],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  function removePhoto(id: string) {
    const updated = photos.filter((p) => p.id !== id)
    if (updated.length > 0 && !updated.some((p) => p.isCover)) {
      updated[0].isCover = true
    }
    onChange(updated)
  }

  function setCover(id: string) {
    onChange(
      photos.map((p) => ({ ...p, isCover: p.id === id })),
    )
  }

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
      >
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-700 font-semibold">
          Drop photos here or click to upload
        </p>
        <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 10MB</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative group rounded-xl overflow-hidden border border-gray-200 aspect-square"
            >
              <img
                src={photo.preview}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
              <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="w-4 h-4 text-white cursor-grab" />
              </div>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => setCover(photo.id)}
                  className={`p-1 rounded-md ${
                    photo.isCover
                      ? 'bg-amber-400 text-white'
                      : 'bg-white/80 text-gray-700 hover:bg-white'
                  }`}
                  title="Set as cover"
                >
                  <Star className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="p-1 rounded-md bg-white/80 text-gray-700 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {photo.isCover && (
                <div className="absolute bottom-2 left-2 bg-amber-400 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-md">
                  Cover
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

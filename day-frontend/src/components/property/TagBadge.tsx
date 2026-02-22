interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  tag: Tag
  onRemove?: () => void
  size?: 'sm' | 'md'
}

export default function TagBadge({ tag, onRemove, size = 'sm' }: Props) {
  const bgColor = tag.color || '#E5E7EB'
  // Compute text color based on brightness
  const isDark = isColorDark(bgColor)
  const textColor = isDark ? 'white' : '#1F2937'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      }`}
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          style={{ color: textColor }}
        >
          x
        </button>
      )}
    </span>
  )
}

function isColorDark(hex: string): boolean {
  const color = hex.replace('#', '')
  if (color.length < 6) return false
  const r = parseInt(color.substring(0, 2), 16)
  const g = parseInt(color.substring(2, 4), 16)
  const b = parseInt(color.substring(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness < 128
}

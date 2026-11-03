import { useTranslation } from 'react-i18next'
import { stepAskKeys } from '../../lib/booking-status'
import type { BookingStatus } from '../../types/booking'
import ConfirmDialog from '../ui/ConfirmDialog'

/** A status moves one way, so every step asks first. Only a confirmed booking can
 *  still be called off. warnings: what the operator should know before saying yes. */
export default function StatusStepDialog({
  target,
  label,
  warnings = [],
  open,
  loading,
  onCancel,
  onConfirm,
}: {
  target: BookingStatus
  label: string
  warnings?: string[]
  open: boolean
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const note = t(target === 'confirmed' ? 'bookings.steps.canCancel' : 'bookings.steps.noUndo')

  return (
    <ConfirmDialog
      open={open}
      title={t(stepAskKeys[target] ?? '')}
      message={[...warnings.map((warning) => `${warning}.`), note].join(' ')}
      confirmLabel={label}
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

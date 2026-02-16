import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Users,
  DollarSign,
  FileText,
  MessageSquare,
  Clock,
  Plus,
  Download,
  Trash2,
  Loader2,
  Send,
} from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  useBooking,
  useChangeBookingStatus,
  useAddPayment,
  useCreateDeposit,
  useDepositAction,
  useAddComment,
  useUploadBookingFile,
  useDeleteBookingFile,
} from '../../hooks/useBookings'
import type {
  Booking,
  BookingAuditLog,
  BookingComment,
  BookingDeposit,
  BookingFile,
  BookingPayment,
  BookingStatus,
  DepositAction,
  DepositActionInput,
  Guest,
  PaymentInput,
  PaymentMethod,
  PaymentType,
} from '../../types/booking'
import BookingStatusBadge from '../../components/booking/BookingStatusBadge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import NumberInput from '../../components/ui/number-input'

const TABS = ['Overview', 'Payments', 'Deposits', 'Files & Comments', 'History'] as const
type Tab = (typeof TABS)[number]

const RAW_API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

function apiUrl(path: string): string {
  const trimmedBase = RAW_API_BASE_URL.replace(/\/+$/, '')
  const normalizedBase = /^https?:\/\//.test(trimmedBase)
    ? trimmedBase
    : `/${trimmedBase.replace(/^\/+/, '')}`
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

interface StatusAction {
  label: string
  target: BookingStatus
  color: string
}

function getStatusActions(status: BookingStatus): StatusAction[] {
  switch (status) {
    case 'pending':
      return [
        { label: 'Confirm', target: 'confirmed', color: 'bg-blue-600 hover:bg-blue-700' },
        { label: 'Cancel', target: 'cancelled', color: 'bg-red-600 hover:bg-red-700' },
      ]
    case 'confirmed':
      return [
        { label: 'Check In', target: 'checked_in', color: 'bg-emerald-600 hover:bg-emerald-700' },
        { label: 'Cancel', target: 'cancelled', color: 'bg-red-600 hover:bg-red-700' },
      ]
    case 'checked_in':
      return [
        { label: 'Check Out', target: 'checked_out', color: 'bg-amber-600 hover:bg-amber-700' },
      ]
    case 'checked_out':
      return [
        { label: 'Complete', target: 'completed', color: 'bg-green-600 hover:bg-green-700' },
      ]
    default:
      return []
  }
}

export default function BookingDetailPage() {
  const { bookingId } = useParams({ strict: false }) as { bookingId: string }
  const navigate = useNavigate()
  const { data: detail, isLoading } = useBooking(bookingId)
  const changeStatus = useChangeBookingStatus(bookingId)
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const from = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('from') || ''
  }, [])
  const isFromGantt = from === 'gantt'

  function handleBack() {
    if (isFromGantt) {
      navigate({ to: '/properties/gantt' })
      return
    }
    navigate({ to: '/bookings' })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-gray-500">Booking not found</p>
      </div>
    )
  }

  const { booking, guest } = detail
  const statusActions = getStatusActions(booking.status)

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Back */}
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isFromGantt ? 'Back to gantt' : 'Back to bookings'}
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">
                {booking.property_internal_name || booking.property_name}
              </h1>
              <BookingStatusBadge status={booking.status} />
            </div>
            <p className="text-sm text-gray-500">
              {booking.guest_name} &middot; {formatDate(booking.check_in)} <ArrowRight className="w-3 h-3 inline text-gray-400" /> {formatDate(booking.check_out)}
            </p>
          </div>
          <div className="flex gap-2">
            {statusActions.map((action) => (
              <motion.button
                key={action.target}
                whileTap={{ scale: 0.97 }}
                onClick={() => changeStatus.mutate(action.target)}
                disabled={changeStatus.isPending}
                className={`${action.color} text-white rounded-xl px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50`}
              >
                {action.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="bg-gray-50 rounded-xl p-1 flex gap-1 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'Overview' && (
              <OverviewTab booking={booking} guest={guest} />
            )}
            {activeTab === 'Payments' && (
              <PaymentsTab
                bookingId={bookingId}
                payments={detail.payments}
                totalPrice={booking.total_price}
                checkIn={booking.check_in}
                checkOut={booking.check_out}
              />
            )}
            {activeTab === 'Deposits' && (
              <DepositsTab bookingId={bookingId} deposits={detail.deposits} />
            )}
            {activeTab === 'Files & Comments' && (
              <FilesCommentsTab bookingId={bookingId} files={detail.files} comments={detail.comments} />
            )}
            {activeTab === 'History' && (
              <HistoryTab auditLogs={detail.audit_logs} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// --- Overview Tab ---
function OverviewTab({ booking, guest }: { booking: Booking; guest: Guest }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Booking Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Booking Details</h2>
        <div className="space-y-3">
          <InfoRow icon={Calendar} label="Check-in" value={formatDate(booking.check_in)} />
          <InfoRow icon={Calendar} label="Check-out" value={formatDate(booking.check_out)} />
          <InfoRow icon={Users} label="Guests" value={`${booking.adults_count} adult${booking.adults_count !== 1 ? 's' : ''}${booking.children_count > 0 ? `, ${booking.children_count} child${booking.children_count !== 1 ? 'ren' : ''}` : ''}`} />
          <InfoRow icon={DollarSign} label="Total Price" value={`$${formatMoney(booking.total_price)}`} />
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-gray-500 w-24">Source</span>
            <span className="text-sm text-gray-900 capitalize">{booking.source}</span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-gray-500 w-24">Color</span>
            <div className="w-5 h-5 rounded-full" style={{ backgroundColor: booking.gantt_color || '#3B82F6' }} />
          </div>
        </div>
      </div>

      {/* Guest Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Guest</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500">Name</p>
            <p className="text-sm font-semibold text-gray-900">{guest.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Phone</p>
            <p className="text-sm text-gray-900">{guest.phone}</p>
          </div>
          {guest.email && (
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-sm text-gray-900">{guest.email}</p>
            </div>
          )}
          {guest.notes && (
            <div>
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{guest.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-400" />
      <span className="text-xs text-gray-500 w-20">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  )
}

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function normalizeNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function formatMoney(value: number | string | null | undefined): string {
  return moneyFormatter.format(normalizeNumber(value))
}

// --- Payments Tab ---
function PaymentsTab({
  bookingId,
  payments,
  totalPrice,
  checkIn,
  checkOut,
}: {
  bookingId: string
  payments: BookingPayment[]
  totalPrice: number
  checkIn: string
  checkOut: string
}) {
  const addPayment = useAddPayment(bookingId)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ amount: '', type: 'payment' as PaymentType, method: 'cash' as PaymentMethod, note: '' })
  const amountStep = 1000

  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => {
      const amount = normalizeNumber(p.amount)
      return sum + (p.type === 'payment' ? amount : -amount)
    }, 0)
  const total = normalizeNumber(totalPrice)
  const remaining = total - totalPaid
  const isOverpaid = remaining < 0
  const overpaid = Math.max(0, -remaining)
  const payableRemaining = Math.max(0, remaining)
  const refundableAmount = Math.max(0, totalPaid)
  const nightsMs =
    new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()
  const nights = Math.max(1, Math.round(nightsMs / (24 * 60 * 60 * 1000)))
  const nightlyRate = total > 0 ? total / nights : 0

  const quickOptionsRaw =
    form.type === 'payment'
      ? [
          { label: '100%', value: total },
          { label: '50%', value: total * 0.5 },
          { label: 'Daily', value: nightlyRate },
        ]
      : [
          ...(isOverpaid ? [{ label: 'Overpaid', value: overpaid }] : []),
          { label: 'Total', value: refundableAmount },
          { label: '50%', value: refundableAmount * 0.5 },
          { label: 'First day', value: nightlyRate },
        ]

  const seenQuickValues = new Set<number>()
  const quickOptions = quickOptionsRaw.filter(({ value }) => {
    if (!Number.isFinite(value) || value <= 0) return false
    if (seenQuickValues.has(value)) return false
    seenQuickValues.add(value)
    return true
  })

  function handleSubmit() {
    const amount = normalizeNumber(form.amount)
    if (!amount || amount <= 0) return
    addPayment.mutate(
      { amount, type: form.type, method: form.method, note: form.note || undefined } as PaymentInput,
      {
        onSuccess: () => {
          setForm({ amount: '', type: 'payment', method: 'cash', note: '' })
          setShowForm(false)
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">
            {isOverpaid ? 'Total / Paid / Overpaid' : 'Total / Paid / Remaining'}
          </p>
          <p className="text-sm font-bold text-gray-900">
            ${formatMoney(total)} / ${formatMoney(totalPaid)} /{' '}
            <span className={isOverpaid ? 'text-red-600' : ''}>
              ${formatMoney(isOverpaid ? overpaid : payableRemaining)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { setForm((f) => ({ ...f, type: 'payment' })); setShowForm(true) }}
            className="flex items-center gap-1 bg-black text-white hover:bg-gray-800 rounded-xl px-4 py-2 text-xs font-bold transition-colors"
          >
            <Plus className="w-3 h-3" /> Payment
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { setForm((f) => ({ ...f, type: 'refund' })); setShowForm(true) }}
            className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold text-gray-700 transition-colors"
          >
            <Plus className="w-3 h-3" /> Refund
          </motion.button>
        </div>
      </div>

      {/* Add payment form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
        >
          <h3 className="text-sm font-bold text-gray-900 mb-3">
            Add {form.type === 'payment' ? 'Payment' : 'Refund'}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <NumberInput
              value={form.amount}
              onChange={(value) => setForm((f) => ({ ...f, amount: value }))}
              min={0}
              step={amountStep}
              placeholder="Amount"
            />
            <Select
              value={form.method}
              onValueChange={(value) => setForm((f) => ({ ...f, method: value as PaymentMethod }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Note (optional)"
              className="bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
            />
          </div>
          {quickOptions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {quickOptions.map((option) => (
                <button
                  key={`${form.type}-${option.label}-${option.value}`}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, amount: String(option.value) }))}
                  className="px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-900 hover:text-white text-xs font-semibold text-gray-700 transition-all"
                >
                  {option.label} (${formatMoney(option.value)})
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={addPayment.isPending}
              className="bg-black text-white hover:bg-gray-800 rounded-xl px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50"
            >
              {addPayment.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
            </motion.button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs font-bold text-gray-500 hover:text-gray-700 px-3"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {/* Payment list */}
      {payments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-sm text-gray-500 text-center py-4">No payments yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Method</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Note</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    {p.type === 'refund' ? '-' : ''}${formatMoney(Math.abs(normalizeNumber(p.amount)))}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 capitalize">{p.type}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 capitalize">{p.method}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      p.status === 'completed' ? 'bg-green-100 text-green-700' :
                      p.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(p.paid_at || p.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --- Deposits Tab ---
function DepositsTab({ bookingId, deposits }: { bookingId: string; deposits: BookingDeposit[] }) {
  const createDep = useCreateDeposit(bookingId)
  const [newAmount, setNewAmount] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const quickDepositOptions = [
    { label: '5k', value: 5000 },
    { label: '10k', value: 10000 },
    { label: '20k', value: 20000 },
  ]

  function handleCreate() {
    const amount = normalizeNumber(newAmount)
    if (!amount || amount <= 0) return
    createDep.mutate(
      { amount },
      { onSuccess: () => { setNewAmount(''); setShowCreate(false) } },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-black text-white hover:bg-gray-800 rounded-xl px-4 py-2 text-xs font-bold transition-colors"
        >
          <Plus className="w-3 h-3" /> Create Deposit
        </motion.button>
      </div>

      {showCreate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
        >
          <h3 className="text-sm font-bold text-gray-900 mb-3">New Deposit</h3>
          <div className="space-y-3">
            <div className="flex gap-3">
              <NumberInput
                value={newAmount}
                onChange={setNewAmount}
                min={0}
                step={1000}
                placeholder="Amount"
                className="flex-1"
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCreate}
                disabled={createDep.isPending}
                className="bg-black text-white hover:bg-gray-800 rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50"
              >
                {createDep.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
              </motion.button>
              <button onClick={() => setShowCreate(false)} className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2">
                Cancel
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickDepositOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setNewAmount(String(option.value))}
                  className="px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-900 hover:text-white text-xs font-semibold text-gray-700 transition-all"
                >
                  {option.label} (${formatMoney(option.value)})
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {deposits.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-sm text-gray-500 text-center py-4">No deposits</p>
        </div>
      ) : (
        deposits.map((dep) => (
          <DepositCard key={dep.id} bookingId={bookingId} deposit={dep} />
        ))
      )}
    </div>
  )
}

function DepositCard({ bookingId, deposit }: { bookingId: string; deposit: BookingDeposit }) {
  const depAction = useDepositAction(bookingId, deposit.id)
  const [actionForm, setActionForm] = useState<{ action: DepositAction; held_amount: string; reason: string } | null>(null)

  useEffect(() => {
    if (deposit.status !== 'paid') {
      setActionForm(null)
    }
  }, [deposit.status])

  function handleAction() {
    if (!actionForm) return
    const input: DepositActionInput = {
      action: actionForm.action,
      ...(actionForm.action === 'partial_hold' && { held_amount: normalizeNumber(actionForm.held_amount) }),
      ...((actionForm.action === 'hold' || actionForm.action === 'partial_hold') && actionForm.reason && { reason: actionForm.reason }),
    }
    depAction.mutate(input, { onSuccess: () => setActionForm(null) })
  }

  const depositStatusStyle: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    paid: 'bg-blue-100 text-blue-700',
    returned: 'bg-green-100 text-green-700',
    held: 'bg-red-100 text-red-700',
    partially_held: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-gray-900">${formatMoney(deposit.amount)}</p>
          {deposit.held_amount > 0 && (
            <p className="text-xs text-gray-500">Held: ${formatMoney(deposit.held_amount)}</p>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${depositStatusStyle[deposit.status] || 'bg-gray-100 text-gray-700'}`}>
          {deposit.status.replace('_', ' ')}
        </span>
      </div>
      {deposit.reason && (
        <p className="text-xs text-gray-500 mb-3">Reason: {deposit.reason}</p>
      )}

      {/* Actions based on status */}
      <div className="flex gap-2 flex-wrap">
        {deposit.status === 'pending' && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setActionForm(null)
              depAction.mutate({ action: 'pay' })
            }}
            disabled={depAction.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          >
            Mark as Paid
          </motion.button>
        )}
        {deposit.status === 'paid' && (
          <>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setActionForm(null)
                depAction.mutate({ action: 'return' })
              }}
              disabled={depAction.isPending}
              className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold disabled:opacity-50"
            >
              Return
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setActionForm({ action: 'hold', held_amount: '', reason: '' })}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold"
            >
              Hold
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setActionForm({ action: 'partial_hold', held_amount: '', reason: '' })}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold"
            >
              Partially Hold
            </motion.button>
          </>
        )}
      </div>

      {/* Action form for hold/partial_hold */}
      {deposit.status === 'paid' && actionForm && (actionForm.action === 'hold' || actionForm.action === 'partial_hold') && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-2">
          {actionForm.action === 'partial_hold' && (
            <NumberInput
              value={actionForm.held_amount}
              onChange={(value) => setActionForm((f) => f && { ...f, held_amount: value })}
              min={0}
              step={1000}
              placeholder="Amount to hold"
            />
          )}
          <input
            type="text"
            value={actionForm.reason}
            onChange={(e) => setActionForm((f) => f && { ...f, reason: e.target.value })}
            placeholder="Reason"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
          />
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleAction}
              disabled={depAction.isPending}
              className="bg-black text-white hover:bg-gray-800 rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50"
            >
              {depAction.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
            </motion.button>
            <button onClick={() => setActionForm(null)} className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2">
              Cancel
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// --- Files & Comments Tab ---
function FilesCommentsTab({ bookingId, files, comments }: { bookingId: string; files: BookingFile[]; comments: BookingComment[] }) {
  const uploadFile = useUploadBookingFile(bookingId)
  const deleteFile = useDeleteBookingFile(bookingId)
  const addComment = useAddComment(bookingId)
  const [commentText, setCommentText] = useState('')

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile.mutate(file)
  }

  function handleComment() {
    if (!commentText.trim()) return
    addComment.mutate(
      { content: commentText },
      { onSuccess: () => setCommentText('') },
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Files */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" /> Files
          </h2>
          <label className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 cursor-pointer transition-colors">
            <Plus className="w-3 h-3" /> Upload
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
        {uploadFile.isPending && (
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
          </div>
        )}
        {files.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No files</p>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700 truncate">{f.file_name}</span>
                <div className="flex gap-1">
                  <a
                    href={apiUrl(`/bookings/${bookingId}/files/${f.id}/download`)}
                    download={f.file_name}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-500" />
                  </a>
                  <button
                    onClick={() => deleteFile.mutate(f.id)}
                    className="p-1 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-gray-400" /> Comments
        </h2>
        <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No comments</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-800">{c.content}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(c.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleComment()}
            placeholder="Add a comment..."
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleComment}
            disabled={addComment.isPending || !commentText.trim()}
            className="bg-black text-white hover:bg-gray-800 rounded-xl px-4 py-2 transition-colors disabled:opacity-50"
          >
            {addComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>
    </div>
  )
}

// --- History Tab ---
function HistoryTab({ auditLogs }: { auditLogs: BookingAuditLog[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-bold text-gray-900 mb-4">Activity History</h2>
      {auditLogs.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No activity yet</p>
      ) : (
        <div className="space-y-3">
          {auditLogs.map((entry) => (
            <div
              key={entry.id}
              className="flex gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
            >
              <div className="mt-0.5">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-700">{entry.action}</p>
                {(entry.action === 'create' || entry.field_name === '*') ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    record: <span className="line-through text-red-400">null</span> <ArrowRight className="w-3 h-3 inline text-gray-400" /> <span className="text-green-600">created</span>
                  </p>
                ) : entry.field_name ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {entry.field_name}: <span className="line-through text-red-400">{entry.old_value || 'null'}</span> <ArrowRight className="w-3 h-3 inline text-gray-400" /> <span className="text-green-600">{entry.new_value || 'null'}</span>
                  </p>
                ) : null}
                <p className="text-xs text-gray-400 mt-0.5">
                  {entry.changed_by && `by ${entry.changed_by} · `}{new Date(entry.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

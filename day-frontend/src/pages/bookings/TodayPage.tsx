import { motion } from 'framer-motion'
import { LogIn, LogOut, Users, Phone, ArrowRight } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTodayChecks, useChangeBookingStatus } from '../../hooks/useBookings'
import type { Booking, BookingStatus } from '../../types/booking'
import BookingStatusBadge from '../../components/booking/BookingStatusBadge'

export default function TodayPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useTodayChecks()

  const checkIns = data?.check_ins ?? []
  const checkOuts = data?.check_outs ?? []
  const inHouse = data?.in_house ?? []

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-xl font-bold text-gray-900 mb-6">Today</h1>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* Check-ins */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <LogIn className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-gray-900">
                  Check-ins Today
                  <span className="ml-2 text-gray-400">({checkIns.length})</span>
                </h2>
              </div>
              {checkIns.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <p className="text-sm text-gray-500 text-center py-4">No check-ins today</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {checkIns.map((booking, i) => (
                    <TodayCard
                      key={booking.id}
                      booking={booking}
                      index={i}
                      actionLabel={booking.status === 'confirmed' ? 'Check In' : undefined}
                      actionTarget={booking.status === 'confirmed' ? 'checked_in' : undefined}
                      actionColor="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Check-outs */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <LogOut className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-gray-900">
                  Check-outs Today
                  <span className="ml-2 text-gray-400">({checkOuts.length})</span>
                </h2>
              </div>
              {checkOuts.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <p className="text-sm text-gray-500 text-center py-4">No check-outs today</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {checkOuts.map((booking, i) => (
                    <TodayCard
                      key={booking.id}
                      booking={booking}
                      index={i}
                      actionLabel={booking.status === 'checked_in' ? 'Check Out' : undefined}
                      actionTarget={booking.status === 'checked_in' ? 'checked_out' : undefined}
                      actionColor="bg-amber-600 hover:bg-amber-700"
                      onClick={() => navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* In-house */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-gray-900">
                  In-House
                  <span className="ml-2 text-gray-400">({inHouse.length})</span>
                </h2>
              </div>
              {inHouse.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <p className="text-sm text-gray-500 text-center py-4">No guests staying now</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inHouse.map((booking, i) => (
                    <TodayCard
                      key={booking.id}
                      booking={booking}
                      index={i}
                      onClick={() => navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

function TodayCard({
  booking,
  index,
  actionLabel,
  actionTarget,
  actionColor,
  onClick,
}: {
  booking: Booking
  index: number
  actionLabel?: string
  actionTarget?: BookingStatus
  actionColor?: string
  onClick: () => void
}) {
  const changeStatus = useChangeBookingStatus(booking.id)
  const canRunAction = Boolean(actionLabel && actionTarget && actionColor)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm cursor-pointer hover:border-gray-300 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: booking.gantt_color || '#3B82F6' }}
            />
            <span className="text-sm font-bold text-gray-900 truncate">
              {booking.property_internal_name || booking.property_name}
            </span>
          </div>
          <p className="text-sm text-gray-700">{booking.guest_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <Phone className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-500">
              {formatDate(booking.check_in)} <ArrowRight className="w-3 h-3 inline text-gray-400" /> {formatDate(booking.check_out)}
            </span>
          </div>
          <div className="mt-2">
            <BookingStatusBadge status={booking.status} />
          </div>
        </div>
        {canRunAction && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={(e) => {
              e.stopPropagation()
              if (!actionTarget) return
              changeStatus.mutate(actionTarget)
            }}
            disabled={changeStatus.isPending}
            className={`${actionColor ?? ''} text-white rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 ml-3 disabled:opacity-50`}
          >
            {changeStatus.isPending ? '...' : actionLabel}
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

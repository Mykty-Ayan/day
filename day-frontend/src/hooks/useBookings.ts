import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  BookingFilters,
  BookingCreateInput,
  BookingUpdateInput,
  BookingStatus,
  PaymentInput,
  DepositInput,
  DepositActionInput,
  CommentInput,
  PriceCalculateInput,
  MoveBookingInput,
  GuestFilters,
} from '../types/booking'
import {
  listBookings,
  getBooking,
  createBooking,
  updateBooking,
  changeBookingStatus,
  moveBooking,
  calculatePrice,
  listPayments,
  addPayment,
  listDeposits,
  createDeposit,
  depositAction,
  listComments,
  addComment,
  uploadFile,
  deleteFile,
  getGanttData,
  getTodayChecks,
  listGuests,
} from '../api/bookings'

const BOOKINGS_KEY = 'bookings'
const BOOKING_KEY = 'booking'
const PAYMENTS_KEY = 'booking-payments'
const DEPOSITS_KEY = 'booking-deposits'
const COMMENTS_KEY = 'booking-comments'
const GANTT_KEY = 'gantt-data'
const TODAY_KEY = 'today-checks'
const GUESTS_KEY = 'guests'
const PRICE_KEY = 'price-calculation'

// --- Bookings ---

export function useBookings(filters: BookingFilters = {}) {
  return useQuery({
    queryKey: [BOOKINGS_KEY, filters],
    queryFn: () => listBookings(filters),
  })
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: [BOOKING_KEY, id],
    queryFn: () => getBooking(id),
    enabled: !!id,
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BookingCreateInput) => createBooking(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] })
      qc.invalidateQueries({ queryKey: [GANTT_KEY] })
      qc.invalidateQueries({ queryKey: [TODAY_KEY] })
    },
  })
}

export function useUpdateBooking(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BookingUpdateInput) => updateBooking(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] })
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, id] })
      qc.invalidateQueries({ queryKey: [GANTT_KEY] })
    },
  })
}

export function useChangeBookingStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: BookingStatus) => changeBookingStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] })
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, id] })
      qc.invalidateQueries({ queryKey: [GANTT_KEY] })
      qc.invalidateQueries({ queryKey: [TODAY_KEY] })
    },
  })
}

export function useMoveBooking(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MoveBookingInput) => moveBooking(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] })
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, id] })
      qc.invalidateQueries({ queryKey: [GANTT_KEY] })
    },
  })
}

export function useCalculatePrice(params: PriceCalculateInput | null) {
  return useQuery({
    queryKey: [PRICE_KEY, params],
    queryFn: () => calculatePrice(params!),
    enabled: !!params?.property_id && !!params?.check_in && !!params?.check_out,
  })
}

// --- Payments ---

export function useBookingPayments(bookingId: string) {
  return useQuery({
    queryKey: [PAYMENTS_KEY, bookingId],
    queryFn: () => listPayments(bookingId),
    enabled: !!bookingId,
  })
}

export function useAddPayment(bookingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PaymentInput) => addPayment(bookingId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PAYMENTS_KEY, bookingId] })
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, bookingId] })
    },
  })
}

// --- Deposits ---

export function useBookingDeposits(bookingId: string) {
  return useQuery({
    queryKey: [DEPOSITS_KEY, bookingId],
    queryFn: () => listDeposits(bookingId),
    enabled: !!bookingId,
  })
}

export function useCreateDeposit(bookingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DepositInput) => createDeposit(bookingId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DEPOSITS_KEY, bookingId] })
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, bookingId] })
    },
  })
}

export function useDepositAction(bookingId: string, depositId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DepositActionInput) => depositAction(bookingId, depositId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DEPOSITS_KEY, bookingId] })
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, bookingId] })
    },
  })
}

// --- Comments ---

export function useBookingComments(bookingId: string) {
  return useQuery({
    queryKey: [COMMENTS_KEY, bookingId],
    queryFn: () => listComments(bookingId),
    enabled: !!bookingId,
  })
}

export function useAddComment(bookingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CommentInput) => addComment(bookingId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [COMMENTS_KEY, bookingId] })
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, bookingId] })
    },
  })
}

// --- Files ---

export function useUploadBookingFile(bookingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadFile(bookingId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, bookingId] })
    },
  })
}

export function useDeleteBookingFile(bookingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) => deleteFile(bookingId, fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BOOKING_KEY, bookingId] })
    },
  })
}

// --- Gantt ---

export function useGanttData(startDate: string, endDate: string) {
  return useQuery({
    queryKey: [GANTT_KEY, startDate, endDate],
    queryFn: () => getGanttData(startDate, endDate),
    enabled: !!startDate && !!endDate,
  })
}

// --- Today ---

export function useTodayChecks() {
  return useQuery({
    queryKey: [TODAY_KEY],
    queryFn: getTodayChecks,
  })
}

// --- Guests ---

export function useGuests(filters: GuestFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [GUESTS_KEY, filters],
    queryFn: () => listGuests(filters),
    enabled,
  })
}

import apiClient from './client'
import type {
  Booking,
  BookingDetail,
  BookingCreateInput,
  BookingUpdateInput,
  BookingFilters,
  BookingStatus,
  BookingPayment,
  PaymentInput,
  BookingDeposit,
  DepositInput,
  DepositActionInput,
  BookingComment,
  CommentInput,
  PriceCalculation,
  PriceCalculateInput,
  MoveBookingInput,
  GanttData,
  TodayChecks,
  Guest,
  GuestFilters,
} from '../types/booking'
import type { PaginatedResponse } from '../types/property'

// --- Bookings ---

export async function listBookings(
  filters: BookingFilters = {},
): Promise<PaginatedResponse<Booking>> {
  const res = await apiClient.get('/bookings', { params: filters })
  return res.data
}

export async function getBooking(id: string): Promise<BookingDetail> {
  const res = await apiClient.get(`/bookings/${id}`)
  return res.data
}

export async function createBooking(data: BookingCreateInput): Promise<Booking> {
  const res = await apiClient.post('/bookings', data)
  return res.data
}

export async function updateBooking(
  id: string,
  data: BookingUpdateInput,
): Promise<Booking> {
  const res = await apiClient.patch(`/bookings/${id}`, data)
  return res.data
}

export async function changeBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<Booking> {
  const res = await apiClient.post(`/bookings/${id}/status`, { status })
  return res.data
}

export async function moveBooking(
  id: string,
  data: MoveBookingInput,
): Promise<Booking> {
  const res = await apiClient.post(`/bookings/${id}/move`, data)
  return res.data
}

export async function calculatePrice(
  data: PriceCalculateInput,
): Promise<PriceCalculation> {
  const res = await apiClient.post('/bookings/calculate-price', data)
  return res.data
}

// --- Payments ---

export async function listPayments(bookingId: string): Promise<BookingPayment[]> {
  const res = await apiClient.get(`/bookings/${bookingId}/payments`)
  return res.data
}

export async function addPayment(
  bookingId: string,
  data: PaymentInput,
): Promise<BookingPayment> {
  const res = await apiClient.post(`/bookings/${bookingId}/payments`, data)
  return res.data
}

// --- Deposits ---

export async function listDeposits(bookingId: string): Promise<BookingDeposit[]> {
  const res = await apiClient.get(`/bookings/${bookingId}/deposits`)
  return res.data
}

export async function createDeposit(
  bookingId: string,
  data: DepositInput,
): Promise<BookingDeposit> {
  const res = await apiClient.post(`/bookings/${bookingId}/deposits`, data)
  return res.data
}

export async function depositAction(
  bookingId: string,
  depositId: string,
  data: DepositActionInput,
): Promise<BookingDeposit> {
  const res = await apiClient.post(
    `/bookings/${bookingId}/deposits/${depositId}/action`,
    data,
  )
  return res.data
}

// --- Comments ---

export async function listComments(bookingId: string): Promise<BookingComment[]> {
  const res = await apiClient.get(`/bookings/${bookingId}/comments`)
  return res.data
}

export async function addComment(
  bookingId: string,
  data: CommentInput,
): Promise<BookingComment> {
  const res = await apiClient.post(`/bookings/${bookingId}/comments`, data)
  return res.data
}

// --- Files ---

export async function uploadFile(
  bookingId: string,
  file: File,
): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  await apiClient.post(`/bookings/${bookingId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export async function deleteFile(
  bookingId: string,
  fileId: string,
): Promise<void> {
  await apiClient.delete(`/bookings/${bookingId}/files/${fileId}`)
}

// --- Gantt ---

export async function getGanttData(
  startDate: string,
  endDate: string,
): Promise<GanttData> {
  const res = await apiClient.get('/bookings/gantt', {
    params: { start_date: startDate, end_date: endDate },
  })
  return res.data
}

// --- Today ---

export async function getTodayChecks(): Promise<TodayChecks> {
  const res = await apiClient.get('/bookings/today')
  return res.data
}

// --- Guests ---

export async function listGuests(
  filters: GuestFilters = {},
): Promise<PaginatedResponse<Guest>> {
  const res = await apiClient.get('/guests', { params: filters })
  return res.data
}
